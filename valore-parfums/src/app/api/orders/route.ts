import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { calculateSellingPrice, getBrandTier, getTierProfitMargin, parseTierMargins, splitProfit } from "@/lib/utils";
import type { OwnerType } from "@/lib/utils";
import { v4 as uuid } from "uuid";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/auth";

// GET all orders — admin only
export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  // Fetch orders and all items in parallel (avoids N+1 subcollection reads)
  const [ordersSnap, allItemsSnap] = await Promise.all([
    db.collection(Collections.orders).get(),
    db.collectionGroup("items").get(),
  ]);

  // Build items map keyed by parent order ID
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const itemsByOrder = new Map<string, any[]>();
  for (const doc of allItemsSnap.docs) {
    const orderId = doc.ref.parent.parent?.id;
    if (!orderId) continue;
    const list = itemsByOrder.get(orderId) || [];
    list.push({ id: doc.id, ...doc.data() });
    itemsByOrder.set(orderId, list);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let allOrders: any[] = ordersSnap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    items: itemsByOrder.get(doc.id) || [],
  }));

  if (status) {
    allOrders = allOrders.filter((o) => o.status === status);
  }
  allOrders.sort((a, b) => {
    const da = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
    const db2 = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
    return db2.getTime() - da.getTime();
  });

  const normalized = allOrders.map((o) => serializeDoc({
    ...o,
    status: o.status || "Pending",
    totalAmount: o.totalAmount ?? o.subtotal ?? 0,
    finalAmount: o.finalAmount ?? o.total ?? 0,
  }));
  return NextResponse.json(normalized);
}

// POST create order (replaces prisma.order.create with nested items)
export async function POST(req: Request) {
  const body = await req.json();
  const { items, voucherCode, ...orderData } = body;

  let subtotal = 0;
  const orderItems: {
    perfumeId: string;
    perfumeName: string;
    ml: number;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    costPrice: number;
    ownerName: string;
    ownerProfit: number;
    platformProfit: number;
  }[] = [];

  // Fetch settings (replaces prisma.settings.findUnique)
  const settingsDoc = await db.collection(Collections.settings).doc("default").get();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settings = settingsDoc.exists ? (settingsDoc.data() as any) : null;
  const packagingCost = settings?.packagingCost ?? 20;
  const margins = parseTierMargins(settings?.tierMargins);

  // Load bulk pricing rules — fetch all, filter/sort in memory to avoid composite index
  const bulkSnap = await db.collection(Collections.bulkPricingRules).get();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bulkRules = bulkSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r: any) => r.isActive === true).sort((a: any, b: any) => b.minQuantity - a.minQuantity) as any[];

  for (const item of items) {
    // Fetch perfume (replaces prisma.perfume.findUnique)
    const perfumeDoc = await db.collection(Collections.perfumes).doc(item.perfumeId).get();
    if (!perfumeDoc.exists) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const perfume = { id: perfumeDoc.id, ...perfumeDoc.data() } as any;

    // Fetch bottle (replaces prisma.bottleInventory.findUnique by ml)
    const bottleSnap = await db.collection(Collections.bottles).where("ml", "==", item.ml).limit(1).get();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bottle = bottleSnap.empty ? null : { id: bottleSnap.docs[0].id, ...bottleSnap.docs[0].data() } as any;
    const bottleCost = bottle?.costPerBottle ?? 0;

    // Personal collection: market price = purchase price
    const effectiveMarketPricePerMl = perfume.isPersonalCollection
      ? perfume.purchasePricePerMl
      : perfume.marketPricePerMl;

    const fullBottlePrice = effectiveMarketPricePerMl * 100;
    const tier = getBrandTier(fullBottlePrice);
    const profitMargin = getTierProfitMargin(tier, item.ml, margins);

    let unitPrice = calculateSellingPrice(
      effectiveMarketPricePerMl,
      item.ml,
      bottleCost,
      packagingCost,
      profitMargin,
    );

    // Apply bulk discount if applicable
    const bulkRule = bulkRules.find((r: { minQuantity: number }) => item.quantity >= r.minQuantity);
    if (bulkRule) {
      unitPrice = Math.ceil(unitPrice * (1 - bulkRule.discountPercent / 100));
    }

    const totalPrice = unitPrice * item.quantity;
    const costPrice = ((perfume.purchasePricePerMl || 0) * item.ml + bottleCost + packagingCost) * item.quantity;
    const itemProfit = totalPrice - costPrice;
    const owner = (perfume.owner || "Store") as OwnerType;
    const { ownerProfit, platformProfit } = splitProfit(itemProfit, owner);

    subtotal += totalPrice;

    // Deduct stock (replaces prisma.perfume.update with decrement)
    await db.collection(Collections.perfumes).doc(item.perfumeId).update({
      totalStockMl: FieldValue.increment(-(item.ml * item.quantity)),
    });

    // Deduct bottle (replaces prisma.bottleInventory.update with decrement)
    if (bottle && bottle.availableCount > 0) {
      await db.collection(Collections.bottles).doc(bottle.id).update({
        availableCount: FieldValue.increment(-item.quantity),
      });
    }

    orderItems.push({
      perfumeId: item.perfumeId,
      perfumeName: perfume.name,
      ml: item.ml,
      quantity: item.quantity,
      unitPrice,
      totalPrice,
      costPrice,
      ownerName: owner,
      ownerProfit,
      platformProfit,
    });
  }

  // Apply voucher (replaces prisma.voucher.findUnique + update)
  let discount = 0;
  if (voucherCode) {
    const voucherSnap = await db.collection(Collections.vouchers).where("code", "==", voucherCode).limit(1).get();
    if (!voucherSnap.empty) {
      const voucherDoc = voucherSnap.docs[0];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const voucher = voucherDoc.data() as any;
      if (voucher.isActive) {
        if (voucher.discountType === "percentage") {
          discount = Math.round((subtotal * voucher.discountValue) / 100);
        } else {
          discount = voucher.discountValue;
        }
        // Increment usage count
        await db.collection(Collections.vouchers).doc(voucherDoc.id).update({
          usedCount: FieldValue.increment(1),
        });
      }
    }
  }

  const total = Math.max(0, subtotal - discount);
  const totalCost = orderItems.reduce((s, i) => s + i.costPrice, 0);
  const profit = total - totalCost;

  // Create order document (replaces prisma.order.create)
  const orderId = uuid();
  const now = Timestamp.now();
  const orderDoc = {
    ...orderData,
    status: orderData.status || "Pending",
    voucherCode: voucherCode || null,
    discount,
    subtotal,
    total,
    profit,
    createdAt: now,
    updatedAt: now,
  };
  await db.collection(Collections.orders).doc(orderId).set(orderDoc);

  // Create items as subcollection (replaces Prisma nested create)
  const createdItems = [];
  for (const oi of orderItems) {
    const itemId = uuid();
    await db.collection(Collections.orders).doc(orderId).collection("items").doc(itemId).set(oi);
    createdItems.push({ id: itemId, ...oi });
  }

  return NextResponse.json(serializeDoc({ id: orderId, ...orderDoc, items: createdItems }), { status: 201 });
}
