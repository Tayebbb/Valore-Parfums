import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { Timestamp } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/auth";
import { generateOrderConfirmedEmail, sendEmail } from "@/lib/email";
import { normalizeOrderStatus, isValidTransition } from "@/lib/orderStatusConfig";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const note = String(body?.note || "").trim();

  const orderRef = db.collection(Collections.orders).doc(id);
  const orderDoc = await orderRef.get();
  if (!orderDoc.exists) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const orderData = orderDoc.data() || {};
  const paymentMethod = String(orderData.paymentMethod || "Cash on Delivery");
  const currentStatus = String(orderData.status || "Pending");
  const previousStatus = normalizeOrderStatus(currentStatus, orderData.pickupMethod);

  const now = Timestamp.now();
  const auditEntry = {
    action: "payment_verified",
    verifiedAt: now,
    verifiedBy: admin.email || admin.name || "admin",
    note,
    previousStatus: currentStatus,
  };

  let nextStatus = previousStatus;
  const updatePayload: Record<string, unknown> = {
    updatedAt: now,
    paymentAudit: [...(Array.isArray(orderData.paymentAudit) ? orderData.paymentAudit : []), auditEntry],
  };

  if (paymentMethod === "Bkash Manual") {
    if (!["Pending Bkash Verification", "Bkash Paid"].includes(currentStatus)) {
      return NextResponse.json({ error: "bKash order is not in a verifiable status" }, { status: 400 });
    }
    nextStatus = "Confirmed";
    updatePayload.status = nextStatus;
    updatePayload.bkashPaymentVerification = {
      verified: true,
      verifiedAt: now,
      verifiedBy: admin.email || admin.name || "admin",
      note,
      source: "verify-payment-api",
    };
  } else if (paymentMethod === "Bank Manual") {
    if (currentStatus !== "Pending Bank Verification") {
      return NextResponse.json({ error: "Bank order is not in a verifiable status" }, { status: 400 });
    }
    nextStatus = "Paid";
    updatePayload.status = nextStatus;
    updatePayload.bankPaymentVerification = {
      verified: true,
      verifiedAt: now,
      verifiedBy: admin.email || admin.name || "admin",
      note,
      source: "verify-payment-api",
    };
  } else {
    return NextResponse.json({ error: "Order does not use manual payment" }, { status: 400 });
  }

  if (previousStatus !== nextStatus) {
    if (!isValidTransition(previousStatus, nextStatus)) {
      return NextResponse.json(
        { error: `Invalid status transition from ${previousStatus} to ${nextStatus}` },
        { status: 400 }
      );
    }
    console.log(`[ORDER] ${id} status: ${previousStatus} → ${nextStatus}`);
  }

  await orderRef.update(updatePayload);

  const [updatedOrderDoc, itemsSnap] = await Promise.all([
    orderRef.get(),
    orderRef.collection("items").get(),
  ]);
  const items = itemsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const emailItems = items.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      perfumeName: String(row.perfumeName || "Perfume"),
      quantity: Number(row.quantity || 0),
      ml: Number(row.ml || 0),
      unitPrice: Number(row.unitPrice || 0),
    };
  });
  const updatedData = updatedOrderDoc.data() || {};

  const customerEmail = String(updatedData.customerEmail || "").trim();
  if (!customerEmail) {
    console.log(`[EMAIL] Skipping order confirmed email for ${id}: missing customer email`);
  } else {
    console.log(`[EMAIL] Sending generateOrderConfirmedEmail to ${customerEmail}`);
    try {
      const result = await sendEmail(
        generateOrderConfirmedEmail({
          customerName: String(updatedData.customerName || "Customer"),
          customerEmail,
          orderId: id,
          items: emailItems,
          total: Number(updatedData.total ?? updatedData.subtotal ?? 0),
        }),
      );
      if (!result.success) {
        console.error(`[EMAIL ERROR] Failed for ${id}:`, result.error || "Unknown error");
        return NextResponse.json({ error: "Failed to send order confirmed email" }, { status: 500 });
      }
    } catch (error) {
      console.error(`[EMAIL ERROR] Failed for ${id}:`, error);
      return NextResponse.json({ error: "Failed to send order confirmed email" }, { status: 500 });
    }
  }

  return NextResponse.json(serializeDoc({
    id: updatedOrderDoc.id,
    ...updatedData,
    status: updatedData.status || nextStatus,
    totalAmount: updatedData.totalAmount ?? updatedData.subtotal ?? 0,
    finalAmount: updatedData.finalAmount ?? updatedData.total ?? 0,
    items,
  }));
}
