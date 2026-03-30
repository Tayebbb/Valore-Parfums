import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { calculateSellingPrice, getBrandTier, getTierProfitMargin, parseTierMargins, splitProfit, normalizeOrderImagePath } from "@/lib/utils";
import type { OwnerType } from "@/lib/utils";
import { v4 as uuid } from "uuid";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { getSessionUser, requireAdmin } from "@/lib/auth";

// GET all orders — admin only
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userParam = searchParams.get("user");
  const status = searchParams.get("status");

  // If user=me, return only orders for logged-in user
  if (userParam === "me") {
    const { getSessionUser } = await import("@/lib/auth");
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // Fetch all orders for this user
    const ordersSnap = await db.collection(Collections.orders).where("customerEmail", "==", user.email).get();
    
    // Return order summaries without fetching items subcollections (much faster)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let allOrders: any[] = ordersSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      items: [],
    }));
    if (status) {
      allOrders = allOrders.filter((o) => o.status === status);
    }
    // Sort by createdAt descending (in memory to avoid composite index requirement)
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

  // Otherwise, admin only
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
  const sessionUser = await getSessionUser();

  const hasFullBottle = Array.isArray(items) && items.some((i: { isFullBottle?: boolean }) => Boolean(i.isFullBottle));
  if (hasFullBottle) {
    if (!String(orderData.customerPhone || "").trim()) {
      return NextResponse.json({ error: "Phone number is required for full bottle orders" }, { status: 400 });
    }
    if (!String(orderData.deliveryAddress || "").trim()) {
      return NextResponse.json({ error: "Delivery address is required for full bottle orders" }, { status: 400 });
    }
    const missingItemSize = items.some((i: { isFullBottle?: boolean; fullBottleSize?: string }) => Boolean(i.isFullBottle) && !String(i.fullBottleSize || "").trim());
    if (missingItemSize) {
      return NextResponse.json({ error: "Desired bottle size is required for full bottle items" }, { status: 400 });
    }
  }

  let subtotal = 0;
  const orderItems: {
    perfumeId: string;
    perfumeName: string;
    perfumeImage?: string;
    ml: number;
    isFullBottle?: boolean;
    fullBottleSize?: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    costPrice: number;
    ownerName: string;
    ownerProfit: number;
    otherOwnerProfit: number;
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
    const perfumeImages: string[] = (() => {
      try {
        return JSON.parse(perfume.images || "[]");
      } catch {
        return [];
      }
    })();
    const perfumeImage = normalizeOrderImagePath(perfumeImages[0]);

    const isFullBottleItem = Boolean(item.isFullBottle);
    const requestedFullBottleSize = String(item.fullBottleSize || "").trim();
    const requestedFullBottleMl = isFullBottleItem
      ? Number.parseFloat(requestedFullBottleSize.replace(/[^0-9.]/g, "")) || 0
      : item.ml;

    // Fetch bottle (replaces prisma.bottleInventory.findUnique by ml)
    const bottleSnap = isFullBottleItem
      ? null
      : await db.collection(Collections.bottles).where("ml", "==", item.ml).limit(1).get();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bottle = bottleSnap && !bottleSnap.empty ? { id: bottleSnap.docs[0].id, ...bottleSnap.docs[0].data() } as any : null;
    const bottleCost = isFullBottleItem ? 0 : (bottle?.costPerBottle ?? 0);

    // Personal collection: market price = purchase price
    const effectiveMarketPricePerMl = perfume.isPersonalCollection
      ? perfume.purchasePricePerMl
      : perfume.marketPricePerMl;

    const fullBottlePrice = effectiveMarketPricePerMl * 100;
    const tier = getBrandTier(fullBottlePrice);
    const profitMargin = getTierProfitMargin(tier, requestedFullBottleMl || item.ml, margins);

    let unitPrice = isFullBottleItem
      ? 0
      : calculateSellingPrice(
        effectiveMarketPricePerMl,
        requestedFullBottleMl,
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
    const costPrice = isFullBottleItem
      ? 0
      : ((perfume.purchasePricePerMl || 0) * requestedFullBottleMl + bottleCost + packagingCost) * item.quantity;
    const itemProfit = totalPrice - costPrice;
    const owner = (perfume.owner || "Store") as OwnerType;
    const ownerProfitPercent = settings?.ownerProfitPercent ?? 85;
    const { ownerProfit, otherOwnerProfit } = splitProfit(itemProfit, owner, ownerProfitPercent);

    if (!isFullBottleItem) {
      subtotal += totalPrice;
    }

    // Deduct stock (replaces prisma.perfume.update with decrement)
    if (!isFullBottleItem) {
      await db.collection(Collections.perfumes).doc(item.perfumeId).update({
        totalStockMl: FieldValue.increment(-(requestedFullBottleMl * item.quantity)),
      });
    }

    // Deduct bottle (replaces prisma.bottleInventory.update with decrement)
    if (!isFullBottleItem && bottle && bottle.availableCount > 0) {
      await db.collection(Collections.bottles).doc(bottle.id).update({
        availableCount: FieldValue.increment(-item.quantity),
      });
    }

    orderItems.push({
      perfumeId: item.perfumeId,
      perfumeName: perfume.name,
      perfumeImage,
      ml: requestedFullBottleMl,
      isFullBottle: isFullBottleItem,
      fullBottleSize: isFullBottleItem ? requestedFullBottleSize : undefined,
      quantity: item.quantity,
      unitPrice,
      totalPrice,
      costPrice,
      ownerName: owner,
      ownerProfit,
      otherOwnerProfit,
    });
  }

  // Apply voucher (replaces prisma.voucher.findUnique + update)
  let discount = 0;
  if (voucherCode && !hasFullBottle) {
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
    userId: sessionUser?.id ?? null,
    customerEmail: orderData.customerEmail || sessionUser?.email || "",
    hasFullBottle,
    deliveryAddress: orderData.deliveryAddress || "",
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
