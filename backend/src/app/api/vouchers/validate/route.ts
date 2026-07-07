import { NextResponse } from "next/server";
import { db, Collections } from "@/lib/prisma";

// Hardcoded owner voucher: prices every item at cost (zero profit). Applied server-side
// in /api/orders POST, so we short-circuit validation here and don't require a DB record.
const OWNER_VOUCHER_CODE = "VALORE1290";

// POST validate voucher code (replaces prisma.voucher.findUnique)
export async function POST(req: Request) {
  const { code, orderTotal, hasFullBottle, customerEmail } = await req.json();

  if (String(code || "").trim().toUpperCase() === OWNER_VOUCHER_CODE) {
    return NextResponse.json({
      valid: true,
      discount: 0,
      discountType: "owner",
      discountValue: 0,
      code: OWNER_VOUCHER_CODE,
      message: "Owner voucher applied — items will be billed at cost price.",
    });
  }

  // Firestore: query vouchers by code (replaces prisma.voucher.findUnique({ where: { code } }))
  const snap = await db.collection(Collections.vouchers).where("code", "==", code).limit(1).get();
  if (snap.empty) return NextResponse.json({ error: "Invalid voucher code" }, { status: 400 });

  const voucherDoc = snap.docs[0];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const voucher = { id: voucherDoc.id, ...voucherDoc.data() } as any;

  if (!voucher.isActive) return NextResponse.json({ error: "Voucher is inactive" }, { status: 400 });
  if (voucher.expiresAt) {
    const expires = voucher.expiresAt.toDate ? voucher.expiresAt.toDate() : new Date(voucher.expiresAt);
    if (expires < new Date()) return NextResponse.json({ error: "Voucher expired" }, { status: 400 });
  }
  if (voucher.usedCount >= voucher.usageLimit)
    return NextResponse.json({ error: "Voucher usage limit reached" }, { status: 400 });
  // Full Bottle requests are manually priced later, so allow voucher application even when current cart total is low.
  if (!hasFullBottle && orderTotal < voucher.minOrderValue)
    return NextResponse.json({ error: `Minimum order value: ${voucher.minOrderValue}` }, { status: 400 });

  // First order only: reject if customer already has any orders
  if (voucher.firstOrderOnly && customerEmail) {
    const email = String(customerEmail).toLowerCase().trim();
    const existingOrders = await db.collection(Collections.orders)
      .where("customerEmail", "==", email)
      .limit(1)
      .get();
    if (!existingOrders.empty) {
      return NextResponse.json({ error: "This voucher is for first orders only" }, { status: 400 });
    }
  }

  let discount = 0;
  if (voucher.discountType === "percentage") {
    discount = Math.round((orderTotal * voucher.discountValue) / 100);
  } else {
    discount = voucher.discountValue;
  }

  return NextResponse.json({
    valid: true,
    discount,
    discountType: voucher.discountType,
    discountValue: voucher.discountValue,
    code: voucher.code,
  });
}
