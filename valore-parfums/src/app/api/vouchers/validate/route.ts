import { NextResponse } from "next/server";
import { db, Collections } from "@/lib/prisma";

// POST validate voucher code (replaces prisma.voucher.findUnique)
export async function POST(req: Request) {
  const { code, orderTotal } = await req.json();

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
  if (orderTotal < voucher.minOrderValue)
    return NextResponse.json({ error: `Minimum order value: ${voucher.minOrderValue}` }, { status: 400 });

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
