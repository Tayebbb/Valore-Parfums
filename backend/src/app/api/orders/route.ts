import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { calculateSellingPrice, getBrandTier, getTierProfitMargin, parseTierMargins, normalizeOrderImagePath } from "@/lib/utils";
import type { OwnerType } from "@/lib/utils";
import { v4 as uuid } from "uuid";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { getSessionUser, requireAdmin } from "@/lib/auth";
import { validateBatch, validateEmail, validateOrderData, validateString } from "@/lib/validation";
import { generateOrderConfirmationEmail, sendEmail } from "@/lib/email";
import { buildOrderPricingSnapshot, computeItemBreakdown, distributeOrderProfit, fromMinorUnits, splitProfitMinor, toMinorUnits } from "@/lib/finance";

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
      entryType: o.entryType || (o.orderSource === "customer_request" || o.orderSource === "stock_request" ? "request" : "order"),
      orderSource: o.orderSource || "standard_order",
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
  const [ordersSnap, allItemsSnap, requestsSnap] = await Promise.all([
    db.collection(Collections.orders).get(),
    db.collectionGroup("items").get(),
    db.collection(Collections.requests).get(),
  ]);

  const requestsById = new Map<string, Record<string, unknown>>();
  for (const requestDoc of requestsSnap.docs) {
    requestsById.set(requestDoc.id, requestDoc.data() as Record<string, unknown>);
  }

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
  let allOrders: any[] = ordersSnap.docs.map((doc) => {
    const data = doc.data();
    const source = String(data.orderSource || "standard_order");
    const linkedRequest = source === "customer_request" ? (requestsById.get(doc.id) || {}) : {};
    return {
      id: doc.id,
      ...data,
      ...(source === "customer_request" ? {
        requestMeta: linkedRequest,
        requestType: linkedRequest.type || data.requestType || "decant",
        requestStatus: linkedRequest.status || data.status || "Pending",
        requestNotes: linkedRequest.notes || "",
      } : {}),
      items: itemsByOrder.get(doc.id) || [],
    };
  });

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
    entryType: o.entryType || (o.orderSource === "customer_request" || o.orderSource === "stock_request" ? "request" : "order"),
    orderSource: o.orderSource || "standard_order",
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

    const orderValidation = validateOrderData({
      customerName: orderData.customerName,
      customerEmail: orderData.customerEmail || sessionUser?.email,
      customerPhone: orderData.customerPhone,
      deliveryAddress: isDelivery ? orderData.deliveryAddress : undefined,
    });
    const pickupValidation = validateString(orderData.pickupMethod, "pickupMethod", {
      minLength: 4,
      maxLength: 20,
    });
    const validation = validateBatch([orderValidation, pickupValidation]);
    if (!validation.valid) {
      return NextResponse.json({ error: "Invalid order input", errors: validation.errors }, { status: 400 });
    }

    if (orderData.customerEmail || sessionUser?.email) {
      const emailValidation = validateEmail(orderData.customerEmail || sessionUser?.email, "customerEmail");
      if (!emailValidation.valid) {
        return NextResponse.json({ error: "Invalid customer email", errors: emailValidation.errors }, { status: 400 });
      }
    }

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
    financialBreakdown: {
      unitCostMinor: number;
      unitSellingPriceMinor: number;
      quantity: number;
      totalCostMinor: number;
      totalRevenueMinor: number;
      computedProfitMinor: number;
    };
    pricingSnapshot: {
      costPricePerMl: number;
      marketPricePerMl: number;
      bottleCost: number;
      packagingCost: number;
      appliedMarginPercent: number;
      partialDealType?: string | null;
      partialSellingPrice?: number | null;
      discountPercent: number;
      pricingTier: string;
    };
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
    const owner1Name = String(settings?.owner1Name || "Tayeb");
    const owner2Name = String(settings?.owner2Name || "Enid");
    const owner1Share = Number(settings?.owner1Share ?? 60);

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
        fieldErrors.paidFromNumber = "Paid from number must be exactly 11 digits and start with 01";
      }
      if (normalizedBkashPayment.transactionNumber.length < 6 || normalizedBkashPayment.transactionNumber.length > 40) {
        fieldErrors.transactionNumber = "Transaction number must be 6-40 characters";
      } else if (!/^[A-Za-z0-9-]+$/.test(normalizedBkashPayment.transactionNumber)) {
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
      if (normalizedBankPayment.accountNumber.length < 8 || normalizedBankPayment.accountNumber.length > 32) {
        fieldErrors.accountNumber = "Account/Card number must be 8-32 characters";
      } else if (!/^[0-9A-Za-z-]+$/.test(normalizedBankPayment.accountNumber)) {
        fieldErrors.accountNumber = "Account/Card number can only contain letters, numbers, and hyphen";
      }
      if (normalizedBankPayment.transactionNumber) {
        if (normalizedBankPayment.transactionNumber.length < 6 || normalizedBankPayment.transactionNumber.length > 40) {
          fieldErrors.transactionNumber = "Transaction number/reference must be 6-40 characters";
        } else if (!/^[A-Za-z0-9-]+$/.test(normalizedBankPayment.transactionNumber)) {
          fieldErrors.transactionNumber = "Transaction number/reference can only contain letters, numbers, and hyphen";
        }
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

      if (!isFullBottleItem && !(requestedFullBottleMl > 0)) {
        return NextResponse.json({ error: "A valid ml value (greater than 0) is required for decant items" }, { status: 400 });
      }

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
    const partialDealType = String(perfume.partialDealType || "").toLowerCase();
    const isPartialDeal = partialDealType === "decant" || partialDealType === "full_bottle";
    const partialSellingPrice = Number(perfume.partialSellingPrice ?? perfume.partialSellingPricePerMl ?? 0);

    let unitPrice = isFullBottleItem
      ? 0
      : isPartialDeal
        ? Math.ceil(Math.max(0, partialSellingPrice))
        : calculateSellingPrice(
          effectiveMarketPricePerMl,
          requestedFullBottleMl,
          bottleCost,
          packagingCost,
          profitMargin,
        );

    // Apply bulk discount if applicable
    const bulkRule = bulkRules.find((r: { minQuantity: number }) => quantity >= r.minQuantity);
    const discountPercent = bulkRule ? Number(bulkRule.discountPercent || 0) : 0;
    if (bulkRule) {
      unitPrice = Math.ceil(unitPrice * (1 - discountPercent / 100));
    }

    const unitCost = isFullBottleItem
      ? 0
      : isPartialDeal
        ? Math.ceil(((perfume.purchasePricePerMl || 0) * requestedFullBottleMl) * (requestedFullBottleMl / 100))
        : ((perfume.purchasePricePerMl || 0) * requestedFullBottleMl + packagingCost);
    const itemBreakdown = computeItemBreakdown({
      unitCostMinor: toMinorUnits(unitCost),
      unitSellingPriceMinor: toMinorUnits(unitPrice),
      quantity,
    });
    const totalPrice = fromMinorUnits(itemBreakdown.totalRevenueMinor);
    const costPrice = fromMinorUnits(itemBreakdown.totalCostMinor);
    const itemProfitMinor = itemBreakdown.computedProfitMinor;
    const owner = (perfume.owner || "Store") as OwnerType;
    const ownerProfitPercent = settings?.ownerProfitPercent ?? 85;
    const { ownerProfitMinor, otherOwnerProfitMinor } = splitProfitMinor(itemProfitMinor, ownerProfitPercent);
    const ownerProfit = owner === "Store" ? 0 : fromMinorUnits(ownerProfitMinor);
    const otherOwnerProfit = owner === "Store" ? 0 : fromMinorUnits(otherOwnerProfitMinor);

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
        financialBreakdown: itemBreakdown,
        pricingSnapshot: {
          costPricePerMl: Number(perfume.purchasePricePerMl || 0),
          marketPricePerMl: Number(effectiveMarketPricePerMl || 0),
          bottleCost: Number(bottleCost || 0),
          packagingCost: Number(packagingCost || 0),
          appliedMarginPercent: Number(profitMargin || 0),
          partialDealType: isPartialDeal ? partialDealType : null,
          partialSellingPrice: isPartialDeal ? partialSellingPrice : null,
          discountPercent,
          pricingTier: tier,
        },
      });

      orderCountByPerfume.set(perfumeId, (orderCountByPerfume.get(perfumeId) || 0) + quantity);
    }

    if (orderItems.length === 0) {
      return NextResponse.json({ error: "No valid items found in cart" }, { status: 400 });
    }

    // Apply voucher (replaces prisma.voucher.findUnique + update)
    let discountMinor = 0;
    const subtotalMinor = orderItems.reduce((sum, item) => sum + item.financialBreakdown.totalRevenueMinor, 0);
    if (voucherCode) {
    const voucherSnap = await db.collection(Collections.vouchers).where("code", "==", voucherCode).limit(1).get();
    if (!voucherSnap.empty) {
      const voucherDoc = voucherSnap.docs[0];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const voucher = voucherDoc.data() as any;
      if (voucher.isActive) {
        if (voucher.discountType === "percentage") {
          discountMinor = Math.round(subtotalMinor * (Number(voucher.discountValue || 0) / 100));
        } else {
          discountMinor = toMinorUnits(Number(voucher.discountValue || 0));
        }
        // Increment usage count
        await db.collection(Collections.vouchers).doc(voucherDoc.id).update({
          usedCount: FieldValue.increment(1),
        });
      }
    }
  }

    discountMinor = Math.max(0, Math.min(discountMinor, subtotalMinor));
    const deliveryFeeMinor = toMinorUnits(isDelivery ? deliveryFee : 0);
    const totalCostMinor = orderItems.reduce((sum, item) => sum + item.financialBreakdown.totalCostMinor, 0);
    const pricingSnapshot = buildOrderPricingSnapshot({
      subtotalMinor,
      discountMinor,
      deliveryFeeMinor,
      totalCostMinor,
    });
    const subtotal = fromMinorUnits(pricingSnapshot.subtotalMinor);
    const discount = fromMinorUnits(pricingSnapshot.discountMinor);
    const total = fromMinorUnits(pricingSnapshot.totalMinor);
    const profit = fromMinorUnits(pricingSnapshot.totalProfitMinor);
    const profitDistribution = distributeOrderProfit({
      items: orderItems.map((item) => ({
        ownerName: item.ownerName,
        computedProfitMinor: item.financialBreakdown.computedProfitMinor,
        ownerProfitMinor: item.ownerName === "Store" ? 0 : toMinorUnits(item.ownerProfit),
        otherOwnerProfitMinor: item.ownerName === "Store" ? 0 : toMinorUnits(item.otherOwnerProfit),
      })),
      owner1Name,
      owner2Name,
      owner1Share,
    });

    // Create order document (replaces prisma.order.create)
    const orderId = uuid();
    const now = Timestamp.now();
    const orderDoc = {
    ...orderData,
    entryType: "order",
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
    pricingSnapshot: {
      ...pricingSnapshot,
      generatedAt: now,
    },
    financialsMinor: {
      subtotalMinor: pricingSnapshot.subtotalMinor,
      discountMinor: pricingSnapshot.discountMinor,
      deliveryFeeMinor: pricingSnapshot.deliveryFeeMinor,
      totalMinor: pricingSnapshot.totalMinor,
      totalCostMinor: pricingSnapshot.totalCostMinor,
      totalProfitMinor: pricingSnapshot.totalProfitMinor,
    },
    profitDistribution,
    financialsLocked: false,
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
      await db.collection(Collections.orders).doc(orderId).collection("items").doc(itemId).set({ ...oi, orderId });
      createdItems.push({ id: itemId, ...oi });
    }

    // Save latest checkout details for signed-in users for faster future checkout.
    if (sessionUser?.id) {
      const savedDeliveryInfo = {
        pickupMethod,
        deliveryZone: isDelivery ? deliveryZone : "",
        pickupLocationId: isDelivery ? "" : String(orderData.pickupLocationId || ""),
        area: isDelivery ? String(orderData.area || "").trim().slice(0, 120) : "",
        city: isDelivery ? String(orderData.city || "").trim().slice(0, 120) : "",
        fullAddress: isDelivery ? String(orderData.fullAddress || "").trim().slice(0, 400) : "",
        addressNotes: isDelivery ? String(orderData.addressNotes || "").trim().slice(0, 400) : "",
      };

      await db.collection(Collections.users).doc(sessionUser.id).set(
        {
          name: String(orderData.customerName || "").trim().slice(0, 100),
          email: String(orderData.customerEmail || sessionUser.email || "").trim().toLowerCase().slice(0, 254),
          phone: String(orderData.customerPhone || "").trim().slice(0, 20),
          savedDeliveryInfo,
          updatedAt: now,
          lastCheckoutAt: now,
        },
        { merge: true },
      );
    }

    // Send confirmation email asynchronously (non-blocking)
    const customerEmail = String(orderDoc.customerEmail || "").trim();
    if (customerEmail) {
      void sendEmail(
        generateOrderConfirmationEmail({
          orderId,
          customerName: String(orderData.customerName || "Customer"),
          customerEmail,
          items: createdItems.map((it) => ({
            perfumeName: String(it.perfumeName || "Perfume"),
            quantity: Number(it.quantity || 0),
            ml: Number(it.ml || 0),
            unitPrice: Number(it.unitPrice || 0),
          })),
          subtotal,
          discount,
          deliveryFee,
          total,
          paymentMethod: normalizedPaymentMethod,
        }),
      ).catch((error) => {
        console.error("Failed to send order confirmation email:", error);
      });
    }

    return NextResponse.json(serializeDoc({ id: orderId, ...orderDoc, items: createdItems }), { status: 201 });
  } catch (error) {
    console.error("Order POST error:", error);
    const message = error instanceof Error ? error.message : "Failed to place order";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
