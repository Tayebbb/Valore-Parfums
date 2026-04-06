import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/auth";
import { generateOrderCancelledEmail, sendEmail } from "@/lib/email";
import { validateString } from "@/lib/validation";

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

    // Cannot cancel already shipped or delivered orders
    if (["Shipped", "Delivered", "Cancelled"].includes(currentStatus)) {
      return NextResponse.json(
        {
          error: `Cannot cancel order with status: ${currentStatus}`,
        },
        { status: 400 },
      );
    }

    const now = Timestamp.now();
    const itemsSnap = await db
      .collection(Collections.orders)
      .doc(id)
      .collection("items")
      .get();

    let refundAmount = 0;
    const cancelledItems: Array<{ perfumeName: string; quantity: number; ml: number; totalPrice: number }> = [];

    // Restore inventory for all items
    for (const itemDoc of itemsSnap.docs) {
      const item = itemDoc.data();
      refundAmount += item.totalPrice || 0;
      cancelledItems.push({
        perfumeName: String(item.perfumeName || "Perfume"),
        quantity: Number(item.quantity || 0),
        ml: Number(item.ml || 0),
        totalPrice: Number(item.totalPrice || 0),
      });

      // Only restore decant items (full bottles are not stock-managed the same way)
      if (!item.isFullBottle) {
        await db.collection(Collections.perfumes).doc(item.perfumeId).update({
          totalStockMl: FieldValue.increment(item.ml * item.quantity),
        });

        // Restore bottle inventory
        const bottleSnap = await db
          .collection(Collections.bottles)
          .where("ml", "==", item.ml)
          .limit(1)
          .get();
        if (!bottleSnap.empty) {
          await bottleSnap.docs[0].ref.update({
            availableCount: FieldValue.increment(item.quantity),
          });
        }
      }
    }

    // Reverse profit transactions if order was already completed
    if (["Completed", "Dispatched"].includes(currentStatus)) {
      const profitSnap = await db
        .collection(Collections.profitTransactions)
        .where("orderId", "==", id)
        .get();

      for (const profitDoc of profitSnap.docs) {
        const profit = profitDoc.data();

        // Reverse the profit
        if (profit.ownerName) {
          if (profit.type === "sale") {
            await db
              .collection(Collections.ownerAccounts)
              .doc(profit.ownerName)
              .update({
                totalEarned: FieldValue.increment(-(profit.amount || 0)),
              });
          } else if (profit.type === "store-share" || profit.type === "cross-owner-share") {
            await db
              .collection(Collections.ownerAccounts)
              .doc(profit.ownerName)
              .update({
                storeShareEarned: FieldValue.increment(-(profit.amount || 0)),
              });
          }
        }

        // Mark profit transaction as reversed
        await profitDoc.ref.update({
          reversed: true,
          reversalReason: `Order ${id} cancelled`,
          reversedAt: now,
        });
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
    try {
      const customerEmail = String(order?.customerEmail || "").trim();
      if (customerEmail) {
        const wasPaid = isOrderPaymentReceived((order || {}) as Record<string, unknown>);
        await sendEmail(
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
        emailSent = true;
      }
    } catch (error) {
      console.error("Failed to send cancellation email:", error);
    }

    // Create admin notification
    const notificationId = crypto.randomUUID();
    await db.collection(Collections.notifications).doc(notificationId).set({
      message: `Order ${id.slice(0, 8)} cancelled (${order?.customerName || "Customer"}). Refund: ৳${refundAmount}`,
      isActive: true,
      sortOrder: Date.now(),
      createdAt: now,
    });

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
