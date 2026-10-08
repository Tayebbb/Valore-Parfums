import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/auth";
import { generateOrderCancelledEmail, pickPackEmailFields, sendEmail } from "@/lib/email";
import type { EmailPackFields } from "@/lib/email";
import { validateString } from "@/lib/validation";
import { normalizeOrderStatus, isValidTransition } from "@/lib/orderStatusConfig";
import { reverseInvestmentSalesForOrder } from "@/lib/investments/orderIntegration";

function hasPaidLikeStatus(status?: string): boolean {
  const normalized = String(status || "").trim().toLowerCase();
  return [
    "confirmed",
    "paid",
    "processing",
    "out for delivery",
    "ready",
    "dispatched",
    "completed",
    "delivered",
    "shipped",
  ].includes(normalized);
}

function isOrderPaymentReceived(orderData: Record<string, unknown>): boolean {
  const paymentMethod = String(orderData.paymentMethod || "").trim();
  if (paymentMethod !== "Bkash Manual" && paymentMethod !== "Bank Manual") return false;

  const bkashPayment = (orderData.bkashPayment as Record<string, unknown> | null) || null;
  const bankPayment = (orderData.bankPayment as Record<string, unknown> | null) || null;
  const hasBkashTxn = Boolean(String(bkashPayment?.transactionNumber || "").trim());
  const hasBankTxn = Boolean(String(bankPayment?.transactionNumber || "").trim());

  return hasBkashTxn || hasBankTxn || hasPaidLikeStatus(String(orderData.status || ""));
}

// POST cancel order
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { cancelReason } = body;

    const reasonValidation = validateString(cancelReason, "cancelReason", {
      minLength: 5,
      maxLength: 500,
    });
    if (!reasonValidation.valid) {
      return NextResponse.json(
        { error: "A valid cancellation reason is required", errors: reasonValidation.errors },
        { status: 400 },
      );
    }

    const orderDoc = await db.collection(Collections.orders).doc(id).get();
    if (!orderDoc.exists) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const order = orderDoc.data();
    const currentStatus = order?.status || "Pending";
    const normalizedCurrentStatus = normalizeOrderStatus(currentStatus, order?.pickupMethod);

    // Enforce transition validation using centralized config
    if (!isValidTransition(normalizedCurrentStatus, "Cancelled")) {
      return NextResponse.json(
        {
          error: `Cannot cancel order with status: ${normalizedCurrentStatus}`,
        },
        { status: 400 },
      );
    }
    // isValidTransition treats same→same as a no-op “transition”, which would
    // let an already-cancelled order be re-cancelled — re-running stock
    // restoration and notifications. Terminal means terminal.
    if (normalizedCurrentStatus === "Cancelled") {
      return NextResponse.json({ error: "Order is already cancelled" }, { status: 400 });
    }

    console.log(`[ORDER] ${id} status: ${normalizedCurrentStatus} → Cancelled`);

    const now = Timestamp.now();
    const itemsSnap = await db
      .collection(Collections.orders)
      .doc(id)
      .collection("items")
      .get();

    let refundAmount = 0;
    const cancelledItems: Array<{
      perfumeName: string;
      quantity: number;
      ml: number;
      totalPrice: number;
      isFullBottle?: boolean;
      fullBottleSize?: string;
      fullBottleCondition?: "new" | "partial";
    } & EmailPackFields> = [];

    // Restore inventory for all items (writes are claim-guarded below;
    // this loop only computes the refund + email item list).
    for (const itemDoc of itemsSnap.docs) {
      const item = itemDoc.data();
      refundAmount += item.totalPrice || 0;
      const isFullBottle = Boolean(item.isFullBottle);
      const conditionFromItem = String(item.fullBottleCondition || "").trim().toLowerCase();
      const conditionFromSnapshot = String((item.pricingSnapshot as { partialDealType?: unknown } | undefined)?.partialDealType || "").trim().toLowerCase();
      cancelledItems.push({
        perfumeName: String(item.perfumeName || "Perfume"),
        quantity: Number(item.quantity || 0),
        ml: Number(item.ml || 0),
        totalPrice: Number(item.totalPrice || 0),
        ...pickPackEmailFields(item),
        isFullBottle,
        fullBottleSize: String(item.fullBottleSize || "").trim() || undefined,
        fullBottleCondition: isFullBottle
          ? (conditionFromItem === "partial" || conditionFromSnapshot === "full_bottle" ? "partial" : "new")
          : undefined,
      });
    }

    // ── One atomic, exactly-once stock restoration ──
    // The stockRestoredAt claim (shared with the PUT-cancel path) prevents
    // concurrent or repeated cancellations from inflating inventory.
    const orderRefForStock = db.collection(Collections.orders).doc(id);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(orderRefForStock);
      if (!snap.exists || snap.data()?.stockRestoredAt) return;
      const bottleRefs: Array<{ ref: FirebaseFirestore.DocumentReference; quantity: number }> = [];
      for (const itemDoc of itemsSnap.docs) {
        const item = itemDoc.data();
        if (item.isFullBottle) continue;
        const bottleSnap = await tx.get(
          db.collection(Collections.bottles).where("ml", "==", item.ml).limit(1),
        );
        if (!bottleSnap.empty) {
          bottleRefs.push({ ref: bottleSnap.docs[0].ref, quantity: Number(item.quantity || 0) });
        }
      }
      for (const itemDoc of itemsSnap.docs) {
        const item = itemDoc.data();
        if (item.isFullBottle) continue;
        tx.update(db.collection(Collections.perfumes).doc(item.perfumeId), {
          totalStockMl: FieldValue.increment(item.ml * item.quantity),
        });
      }
      for (const b of bottleRefs) {
        tx.update(b.ref, { availableCount: FieldValue.increment(b.quantity) });
      }
      tx.update(orderRefForStock, { stockRestoredAt: now });
    });

    // Reverse profit transactions if financials were recognised. Recognition
    // happens when the order enters the completed-family status (canonical db
    // value "Dispatched"; aliases: Delivered/Completed/Fulfilled) — compare the
    // NORMALIZED status so alias-stored orders reverse too.
    if (normalizedCurrentStatus === "Dispatched") {
      const orderRef = db.collection(Collections.orders).doc(id);
      const profitSnap = await db
        .collection(Collections.profitTransactions)
        .where("orderId", "==", id)
        .get();

      // ── One atomic, exactly-once reversal ──
      // The profitReversedAt claim (shared with the PUT-cancel path) makes the
      // balance decrements exactly-once under concurrent/duplicate cancels,
      // and bundling all writes prevents a partial reversal on crash.
      const rows = profitSnap.docs
        .map((d) => ({ ref: d.ref, data: d.data() }))
        .filter((r) => !r.data.reversed); // never un-credit the same row twice
      const aggregated = new Map<string, { totalEarned: number; storeShareEarned: number }>();
      for (const { data: profit } of rows) {
        if (!profit.ownerName) continue;
        const acc = aggregated.get(profit.ownerName) || { totalEarned: 0, storeShareEarned: 0 };
        if (profit.type === "sale" || profit.type === "owner-revenue-base") {
          acc.totalEarned -= profit.amount || 0;
        } else if (profit.type === "store-share" || profit.type === "cross-owner-share") {
          acc.storeShareEarned -= profit.amount || 0;
        }
        aggregated.set(profit.ownerName, acc);
      }

      const reversed = await db.runTransaction(async (tx) => {
        const snap = await tx.get(orderRef);
        if (!snap.exists || snap.data()?.profitReversedAt) return false;
        for (const [ownerName, sums] of aggregated) {
          const increments: Record<string, FieldValue> = {};
          if (sums.totalEarned !== 0) increments.totalEarned = FieldValue.increment(sums.totalEarned);
          if (sums.storeShareEarned !== 0) increments.storeShareEarned = FieldValue.increment(sums.storeShareEarned);
          if (Object.keys(increments).length > 0) {
            tx.set(db.collection(Collections.ownerAccounts).doc(ownerName), increments, { merge: true });
          }
        }
        for (const { ref } of rows) {
          tx.update(ref, {
            reversed: true,
            reversalReason: `Order ${id} cancelled`,
            reversedAt: now,
          });
        }
        tx.update(orderRef, { profitReversedAt: now });
        return true;
      });
      if (!reversed) {
        console.log(`[ORDER] ${id} profit already reversed — skipping duplicate reversal`);
      }

      // Reverse investor-funded ledger activity (idempotent, best-effort)
      const investmentReversal = await reverseInvestmentSalesForOrder(id, admin.id);
      if (investmentReversal.reversedEntries > 0 || investmentReversal.errors.length > 0) {
        console.log(
          `[INVESTMENT] Order ${id} cancellation: reversed ${investmentReversal.reversedEntries} ledger entr(ies)` +
            (investmentReversal.errors.length ? `, errors: ${investmentReversal.errors.join("; ")}` : ""),
        );
      }
    }

    // Handle voucher: if one was applied, decrement its used count
    if (order?.voucherCode && order?.voucherAppliedAt) {
      const voucherSnap = await db
        .collection(Collections.vouchers)
        .where("code", "==", order.voucherCode)
        .limit(1)
        .get();

      if (!voucherSnap.empty) {
        const voucherDoc = voucherSnap.docs[0];
        const voucher = voucherDoc.data();
        if (voucher.usedCount > 0) {
          await voucherDoc.ref.update({
            usedCount: FieldValue.increment(-1),
            updatedAt: now,
          });
        }
      }
    }

    // Update order status
    await db.collection(Collections.orders).doc(id).update({
      status: "Cancelled",
      cancelledAt: now,
      cancelReason: String(cancelReason || "").trim().slice(0, 500),
      refundAmount,
      updatedAt: now,
    });

    // Send cancellation email
    let emailSent = false;
    let emailError: string | null = null;
    const customerEmail = String(order?.customerEmail || "").trim();
    if (!customerEmail) {
      console.log(`[EMAIL] Skipping cancellation email for ${id}: missing customer email`);
    } else {
      const wasPaid = isOrderPaymentReceived((order || {}) as Record<string, unknown>);
      console.log(`[EMAIL] Sending generateOrderCancelledEmail to ${customerEmail}`);
      try {
        const result = await sendEmail(
          generateOrderCancelledEmail({
            orderId: id,
            customerName: String(order?.customerName || "Customer"),
            customerEmail,
            cancelReason: String(cancelReason || "").trim(),
            refundAmount: wasPaid ? refundAmount : 0,
            isPaid: wasPaid,
            items: cancelledItems,
          }),
        );
        if (!result.success) {
          emailError = result.error || "Unknown error";
          console.error(`[EMAIL ERROR] Failed for ${id}:`, emailError);
        } else {
          emailSent = true;
        }
      } catch (error) {
        emailError = error instanceof Error ? error.message : "Unknown error";
        console.error(`[EMAIL ERROR] Failed for ${id}:`, error);
      }
    }

    // Create admin notification
    const notificationId = crypto.randomUUID();
    await db.collection(Collections.notifications).doc(notificationId).set({
      message: `Order ${id.slice(0, 8)} cancelled (${order?.customerName || "Customer"}). Refund: ৳${refundAmount}`,
      isActive: true,
      sortOrder: Date.now(),
      createdAt: now,
    });

    if (emailError) {
      return NextResponse.json(
        { error: "Failed to send cancellation email", details: emailError },
        { status: 500 },
      );
    }

    return NextResponse.json(
      serializeDoc({
        id,
        status: "Cancelled",
        cancelledAt: now.toDate?.() || new Date(),
        refundAmount,
        emailSent,
      }),
      { status: 200 },
    );
  } catch (error) {
    console.error("Order cancellation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to cancel order" },
      { status: 500 },
    );
  }
}
