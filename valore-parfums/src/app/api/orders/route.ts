import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { calculateSellingPrice, getBrandTier, getTierProfitMargin, parseTierMargins, splitProfit, normalizeOrderImagePath } from "@/lib/utils";
import type { OwnerType } from "@/lib/utils";
import { v4 as uuid } from "uuid";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { getSessionUser, requireAdmin } from "@/lib/auth";

async function notifyAdminViaWebhook(payload: {
  title: string;
  message: string;
  orderId: string;
  paymentMethod: string;
  customerName: string;
}) {
  const webhookUrl = process.env.ADMIN_ALERT_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "Valore Parfums",
        type: "manual_payment_submitted",
        ...payload,
      }),
    });
  } catch (error) {
    console.error("Admin webhook notification failed:", error);
  }
}

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
  try {
    const body = await req.json();
    const { items, voucherCode, paymentMethod, bkashPayment, bankPayment, ...orderData } = body;
    const sessionUser = await getSessionUser();
    const pickupMethod = String(orderData.pickupMethod || "Pickup");
    const isDelivery = pickupMethod === "Delivery";
    const deliveryZone = String(orderData.deliveryZone || "");
    const normalizedPaymentMethod = String(paymentMethod || "Cash on Delivery");
    const isBkashManualPayment = normalizedPaymentMethod === "Bkash Manual";
    const isBankManualPayment = normalizedPaymentMethod === "Bank Manual";

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Cart items are required" }, { status: 400 });
    }

    if (!String(orderData.customerName || "").trim()) {
      return NextResponse.json({ error: "Customer name is required" }, { status: 400 });
    }
    if (!String(orderData.customerPhone || "").trim()) {
      return NextResponse.json({ error: "Customer phone is required" }, { status: 400 });
    }

    if (isDelivery && !["Inside Dhaka", "Outside Dhaka"].includes(deliveryZone)) {
      return NextResponse.json({ error: "Delivery zone is required" }, { status: 400 });
    }

    if (isDelivery && !String(orderData.deliveryAddress || "").trim()) {
      return NextResponse.json({ error: "Delivery address is required" }, { status: 400 });
    }

    const hasFullBottle = items.some((i: { isFullBottle?: boolean }) => Boolean(i.isFullBottle));
    if (hasFullBottle) {
      if (!String(orderData.customerPhone || "").trim()) {
        return NextResponse.json({ error: "Phone number is required for full bottle orders" }, { status: 400 });
      }
      if (isDelivery && !String(orderData.deliveryAddress || "").trim()) {
        return NextResponse.json({ error: "Delivery address is required for full bottle orders" }, { status: 400 });
      }
      const missingItemSize = items.some((i: { isFullBottle?: boolean; fullBottleSize?: string }) => Boolean(i.isFullBottle) && !String(i.fullBottleSize || "").trim());
      if (missingItemSize) {
        return NextResponse.json({ error: "Desired bottle size is required for full bottle items" }, { status: 400 });
      }
    }

    let subtotal = 0;
    const orderCountByPerfume = new Map<string, number>();
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
    const legacyDeliveryFee = Number(settings?.deliveryFee ?? 0);
    const deliveryFeeInsideDhaka = Number(settings?.deliveryFeeInsideDhaka ?? legacyDeliveryFee);
    const deliveryFeeOutsideDhaka = Number(settings?.deliveryFeeOutsideDhaka ?? legacyDeliveryFee);
    const deliveryFee = isDelivery
      ? (deliveryZone === "Outside Dhaka" ? deliveryFeeOutsideDhaka : deliveryFeeInsideDhaka)
      : 0;
    const margins = parseTierMargins(settings?.tierMargins);

    const normalizedBkashPayment = {
      customerName: String(bkashPayment?.customerName || "").trim(),
      paidFromNumber: String(bkashPayment?.paidFromNumber || "").trim(),
      transactionNumber: String(bkashPayment?.transactionNumber || "").trim(),
      notes: String(bkashPayment?.notes || "").trim(),
    };

    const normalizedBankPayment = {
      accountName: String(bankPayment?.accountName || "").trim(),
      accountNumber: String(bankPayment?.accountNumber || "").trim(),
      transactionNumber: String(bankPayment?.transactionNumber || "").trim(),
      notes: String(bankPayment?.notes || "").trim(),
    };

    if (isBkashManualPayment) {
      const fieldErrors: Record<string, string> = {};
      if (!normalizedBkashPayment.customerName || normalizedBkashPayment.customerName.length < 2) {
        fieldErrors.customerName = "Customer name is required";
      }
      if (!/^01\d{9}$/.test(normalizedBkashPayment.paidFromNumber)) {
        fieldErrors.paidFromNumber = "Paid from number must be a valid 11-digit mobile number";
      }
      if (!/^[A-Za-z0-9-]{6,40}$/.test(normalizedBkashPayment.transactionNumber)) {
        fieldErrors.transactionNumber = "Transaction number must be 6-40 characters (letters, numbers, hyphen)";
      }
      if (Object.keys(fieldErrors).length > 0) {
        return NextResponse.json({ error: "Invalid bKash payment details", fieldErrors }, { status: 400 });
      }
    }

    if (isBankManualPayment) {
      const fieldErrors: Record<string, string> = {};
      if (!normalizedBankPayment.accountName || normalizedBankPayment.accountName.length < 2) {
        fieldErrors.accountName = "Account/Card name is required";
      }
      if (!/^[0-9A-Za-z-]{8,32}$/.test(normalizedBankPayment.accountNumber)) {
        fieldErrors.accountNumber = "Account/Card number must be 8-32 characters (letters, numbers, hyphen)";
      }
      if (!/^[A-Za-z0-9-]{6,40}$/.test(normalizedBankPayment.transactionNumber)) {
        fieldErrors.transactionNumber = "Transaction number/reference must be 6-40 characters (letters, numbers, hyphen)";
      }
      if (Object.keys(fieldErrors).length > 0) {
        return NextResponse.json({ error: "Invalid bank payment details", fieldErrors }, { status: 400 });
      }
    }

    // Load bulk pricing rules — fetch all, filter/sort in memory to avoid composite index
    const bulkSnap = await db.collection(Collections.bulkPricingRules).get();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bulkRules = bulkSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r: any) => r.isActive === true).sort((a: any, b: any) => b.minQuantity - a.minQuantity) as any[];

    for (const item of items) {
    // Fetch perfume (replaces prisma.perfume.findUnique)
      const perfumeId = String(item.perfumeId || "").trim();
      if (!perfumeId) continue;
      const quantity = Math.floor(Number(item.quantity));
      if (!Number.isFinite(quantity) || quantity <= 0) continue;
      const perfumeDoc = await db.collection(Collections.perfumes).doc(perfumeId).get();
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
        : Number(item.ml || 0);

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
    const bulkRule = bulkRules.find((r: { minQuantity: number }) => quantity >= r.minQuantity);
    if (bulkRule) {
      unitPrice = Math.ceil(unitPrice * (1 - bulkRule.discountPercent / 100));
    }

    const totalPrice = unitPrice * quantity;
    const costPrice = isFullBottleItem
      ? 0
      : ((perfume.purchasePricePerMl || 0) * requestedFullBottleMl + bottleCost + packagingCost) * quantity;
    const itemProfit = totalPrice - costPrice;
    const owner = (perfume.owner || "Store") as OwnerType;
    const ownerProfitPercent = settings?.ownerProfitPercent ?? 85;
    const { ownerProfit, otherOwnerProfit } = splitProfit(itemProfit, owner, ownerProfitPercent);

    if (!isFullBottleItem) {
      subtotal += totalPrice;
    }

    // Deduct stock (replaces prisma.perfume.update with decrement)
    if (!isFullBottleItem) {
      await db.collection(Collections.perfumes).doc(perfumeId).update({
        totalStockMl: FieldValue.increment(-(requestedFullBottleMl * quantity)),
      });
    }

    // Deduct bottle (replaces prisma.bottleInventory.update with decrement)
    if (!isFullBottleItem && bottle && bottle.availableCount > 0) {
      await db.collection(Collections.bottles).doc(bottle.id).update({
        availableCount: FieldValue.increment(-quantity),
      });
    }

      orderItems.push({
        perfumeId,
        perfumeName: perfume.name,
        perfumeImage,
        ml: requestedFullBottleMl,
        isFullBottle: isFullBottleItem,
        ...(isFullBottleItem ? { fullBottleSize: requestedFullBottleSize } : {}),
        quantity,
        unitPrice,
        totalPrice,
        costPrice,
        ownerName: owner,
        ownerProfit,
        otherOwnerProfit,
      });

      orderCountByPerfume.set(perfumeId, (orderCountByPerfume.get(perfumeId) || 0) + quantity);
    }

    if (orderItems.length === 0) {
      return NextResponse.json({ error: "No valid items found in cart" }, { status: 400 });
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

    const total = Math.max(0, subtotal - discount) + (isDelivery ? deliveryFee : 0);
    const totalCost = orderItems.reduce((s, i) => s + i.costPrice, 0);
    const profit = (total - (isDelivery ? deliveryFee : 0)) - totalCost;

    // Create order document (replaces prisma.order.create)
    const orderId = uuid();
    const now = Timestamp.now();
    const orderDoc = {
    ...orderData,
    userId: sessionUser?.id ?? null,
    isGuestOrder: !sessionUser,
    customerEmail: orderData.customerEmail || sessionUser?.email || "",
    hasFullBottle,
    pickupMethod,
    deliveryZone: isDelivery ? deliveryZone : "",
    pickupLocationId: orderData.pickupLocationId || "",
    pickupLocationName: orderData.pickupLocationName || "",
    deliveryAddress: orderData.deliveryAddress || "",
    deliveryFee: isDelivery ? deliveryFee : 0,
    status: isBkashManualPayment ? "Pending Bkash Verification" : isBankManualPayment ? "Pending Bank Verification" : "Pending",
    paymentMethod: normalizedPaymentMethod,
    bkashPayment: isBkashManualPayment
      ? {
        ...normalizedBkashPayment,
        amount: total,
        submittedAt: now,
      }
      : null,
    bankPayment: isBankManualPayment
      ? {
        ...normalizedBankPayment,
        amount: total,
        submittedAt: now,
      }
      : null,
    voucherCode: voucherCode || null,
    discount,
    subtotal,
    total,
    profit,
    createdAt: now,
    updatedAt: now,
    };
    await db.collection(Collections.orders).doc(orderId).set(orderDoc);

    if (isBankManualPayment) {
      const notificationId = uuid();
      await db.collection(Collections.notifications).doc(notificationId).set({
        message: `New Bank Payment submitted for order ${orderId.slice(0, 8)} (${orderData.customerName || "Customer"})`,
        isActive: true,
        sortOrder: Date.now(),
        createdAt: now,
      });

      await notifyAdminViaWebhook({
        title: "New Bank Payment Submitted",
        message: `Order ${orderId.slice(0, 8)} is pending bank verification`,
        orderId,
        paymentMethod: normalizedPaymentMethod,
        customerName: String(orderData.customerName || "Customer"),
      });
    }

    if (isBkashManualPayment) {
      await notifyAdminViaWebhook({
        title: "New bKash Payment Submitted",
        message: `Order ${orderId.slice(0, 8)} is pending bKash verification`,
        orderId,
        paymentMethod: normalizedPaymentMethod,
        customerName: String(orderData.customerName || "Customer"),
      });
    }

    if (orderCountByPerfume.size > 0) {
      await Promise.all(
        Array.from(orderCountByPerfume.entries()).map(([perfumeId, count]) =>
          db.collection(Collections.perfumes).doc(perfumeId).set(
            {
              totalOrders: FieldValue.increment(count),
              lastOrderedAt: now,
              updatedAt: now,
            },
            { merge: true },
          ),
        ),
      );
    }

    // Create items as subcollection (replaces Prisma nested create)
    const createdItems = [];
    for (const oi of orderItems) {
      const itemId = uuid();
      await db.collection(Collections.orders).doc(orderId).collection("items").doc(itemId).set(oi);
      createdItems.push({ id: itemId, ...oi });
    }

    return NextResponse.json(serializeDoc({ id: orderId, ...orderDoc, items: createdItems }), { status: 201 });
  } catch (error) {
    console.error("Order POST error:", error);
    const message = error instanceof Error ? error.message : "Failed to place order";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
