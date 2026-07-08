import { NextResponse } from "next/server";
import { db, Collections } from "@/lib/prisma";

// Hardcoded owner voucher: prices every item at cost (zero profit). Applied server-side
// in /api/orders POST; here we preview the equivalent discount so the checkout summary
// shows the reduced total. Full-bottle lines are excluded (same rule as order creation).
const OWNER_VOUCHER_CODE = "VALORE1290";

type CartItem = {
  perfumeId?: string;
  ml?: number;
  quantity?: number;
  unitPrice?: number;
  isFullBottle?: boolean;
};

async function computeOwnerVoucherDiscount(items: CartItem[]): Promise<number> {
  if (!Array.isArray(items) || items.length === 0) return 0;

  const settingsDoc = await db.collection(Collections.settings).doc("main").get();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settings = settingsDoc.exists ? (settingsDoc.data() as any) : null;
  const packagingCost = Number(settings?.packagingCost ?? 20);

  let totalDiscount = 0;
  for (const item of items) {
    if (item.isFullBottle) continue; // owner voucher skips full-bottle lines
    const perfumeId = String(item.perfumeId || "").trim();
    const ml = Number(item.ml || 0);
    const quantity = Math.floor(Number(item.quantity || 0));
    const unitPrice = Math.max(0, Math.round(Number(item.unitPrice || 0)));
    if (!perfumeId || !(ml > 0) || !(quantity > 0)) continue;

    const perfumeDoc = await db.collection(Collections.perfumes).doc(perfumeId).get();
    if (!perfumeDoc.exists) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const perfume = perfumeDoc.data() as any;

    const bottleSnap = await db.collection(Collections.bottles).where("ml", "==", ml).limit(1).get();
    const bottleCost = bottleSnap.empty ? 0 : Number(bottleSnap.docs[0].data()?.costPerBottle || 0);

    const purchasePricePerMl = Number(perfume?.purchasePricePerMl || 0);
    const unitCost = Math.max(0, Math.round(purchasePricePerMl * ml + packagingCost + bottleCost));
    const perLineDiscount = Math.max(0, (unitPrice - unitCost) * quantity);
    totalDiscount += perLineDiscount;
  }
  return totalDiscount;
}

// POST validate voucher code (replaces prisma.voucher.findUnique)
export async function POST(req: Request) {
  const { code, orderTotal, hasFullBottle, customerEmail, items } = await req.json();

  if (String(code || "").trim().toUpperCase() === OWNER_VOUCHER_CODE) {
    const ownerDiscount = await computeOwnerVoucherDiscount(items as CartItem[]);
    return NextResponse.json({
      valid: true,
      discount: ownerDiscount,
      discountType: "owner",
      discountValue: ownerDiscount,
      code: OWNER_VOUCHER_CODE,
      message: ownerDiscount > 0
        ? `Owner voucher applied — items billed at cost price (-${ownerDiscount} BDT).`
        : "Owner voucher applied — items will be billed at cost price on the final invoice.",
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
