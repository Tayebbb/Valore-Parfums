import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { calculateSellingPrice, getBrandTier, getTierProfitMargin, parseTierMargins, normalizeOrderImagePath } from "@/lib/utils";
import { v4 as uuid } from "uuid";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { getSessionUser, requireAdmin } from "@/lib/auth";
import { validateBatch, validateEmail, validatePhone, validateString } from "@/lib/validation";
import { generateOrderConfirmationEmail, generatePickupConfirmationEmail, generateAdminNewOrderAlertEmail, pickPackEmailFields, sendEmail } from "@/lib/email";
import { buildOrderPricingSnapshot, computeItemBreakdown, distributeOrderProfit, fromMinorUnits, orderDiscountMinor, toMinorUnits } from "@/lib/finance";
import { calculateDiscountedPayouts, calculateItemOwnerShares } from "@/lib/ownerEarnings";
import { invalidatePackCaches } from "@/lib/api-cache";
import { parsePackRequests, preparePackOrderLines } from "@/lib/packs/order";
import type { PackComponentMeta, PackOrderLine } from "@/lib/packs/order";

/** Thrown inside the pack-order transaction when inventory cannot cover the order. */
class OrderStockError extends Error {}

function normalizeLookupEmail(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function orderBelongsToUser(order: Record<string, unknown>, user: { id: string; email: string }): boolean {
  const explicitOwnerId = String(order.userId || "").trim();
  const placedByEmail = normalizeLookupEmail(order.placedByEmail);
  const recipientEmail = normalizeLookupEmail(order.customerEmail || order.recipientEmail);
  const userEmail = normalizeLookupEmail(user.email);

  if (explicitOwnerId === user.id) return true;
  if (placedByEmail && placedByEmail === userEmail) return true;
  if (!explicitOwnerId && !placedByEmail && recipientEmail === userEmail) return true;
  return false;
}

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
    // Fetch all orders for this user using ownership fields, then fall back to
    // legacy recipient-email-only orders when there is no explicit owner.
    const [byUserIdSnap, byPlacedByEmailSnap, byRecipientEmailSnap] = await Promise.all([
      db.collection(Collections.orders).where("userId", "==", user.id).get(),
      db.collection(Collections.orders).where("placedByEmail", "==", user.email).get(),
      db.collection(Collections.orders).where("customerEmail", "==", user.email).get(),
    ]);

    const orderDocsMap = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    for (const doc of byUserIdSnap.docs) orderDocsMap.set(doc.id, doc);
    for (const doc of byPlacedByEmailSnap.docs) orderDocsMap.set(doc.id, doc);
    for (const doc of byRecipientEmailSnap.docs) {
      const data = doc.data() as Record<string, unknown>;
      if (orderBelongsToUser(data, user)) {
        orderDocsMap.set(doc.id, doc);
      }
    }
    
    // Return order summaries without fetching items subcollections (much faster)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let allOrders: any[] = Array.from(orderDocsMap.values()).map((doc) => ({
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
    // `packs` is pulled out of the body so client input can never reach the order doc via ...orderData.
    const { items: rawItems, packs: rawPacks, voucherCode: rawVoucherCode, manualDiscountPercent, paymentMethod, bkashPayment, bankPayment, ...orderData } = body;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = Array.isArray(rawItems) ? rawItems : [];
    const sessionUser = await getSessionUser();
    const manualAdminOrder = Boolean(orderData.manualAdminOrder);

    // Owner voucher: sells at cost price (zero profit) - requires admin authorization
    const OWNER_VOUCHER_CODE = (process.env.OWNER_VOUCHER_CODE || "VALORE1290").trim().toUpperCase();
    const normalizedVoucherCode = String(rawVoucherCode || "").trim().toUpperCase();
    const isOwnerVoucher = Boolean(normalizedVoucherCode && normalizedVoucherCode === OWNER_VOUCHER_CODE);

    if (isOwnerVoucher) {
      const admin = await requireAdmin();
      if (!admin) {
        return NextResponse.json({ error: "Unauthorized: Admin privileges required to use owner voucher" }, { status: 403 });
      }
    }

    const voucherCode = isOwnerVoucher ? OWNER_VOUCHER_CODE : String(rawVoucherCode || "").trim();

    if (manualAdminOrder) {
      const admin = await requireAdmin();
      if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (manualDiscountPercent !== undefined) {
      if (!manualAdminOrder || typeof manualDiscountPercent !== "number" || !Number.isFinite(manualDiscountPercent)
        || manualDiscountPercent < 0 || manualDiscountPercent > 100) {
        return NextResponse.json({ error: "Manual order discounts must be a percentage between 0 and 100" }, { status: 400 });
      }
      if (manualDiscountPercent > 0 && voucherCode) {
        return NextResponse.json({ error: "Choose either a voucher or a manual discount" }, { status: 400 });
      }
    }

    const pickupMethod = String(orderData.pickupMethod || "Pickup");
    const isDelivery = pickupMethod === "Delivery";
    const deliveryZone = String(orderData.deliveryZone || "");
    const normalizedPaymentMethod = String(paymentMethod || "Cash on Delivery");
    const isBkashManualPayment = normalizedPaymentMethod === "Bkash Manual";
    const isBankManualPayment = normalizedPaymentMethod === "Bank Manual";
    const recipientEmail = String(
      orderData.recipientEmail ||
      orderData.customerEmail ||
      (!manualAdminOrder ? sessionUser?.email : "") ||
      "",
    )
      .trim()
      .toLowerCase();

    const orderValidation = validateBatch([
      validateString(orderData.customerName, "customerName", { minLength: 2, maxLength: 100 }),
      validateEmail(recipientEmail, "customerEmail"),
      validatePhone(orderData.customerPhone, "customerPhone"),
      ...(isDelivery
        ? [validateString(orderData.deliveryAddress, "deliveryAddress", { minLength: 10, maxLength: 300 })]
        : []),
    ]);
    const pickupValidation = validateString(orderData.pickupMethod, "pickupMethod", {
      minLength: 4,
      maxLength: 20,
    });
    const validation = validateBatch([orderValidation, pickupValidation]);
    if (!validation.valid) {
      return NextResponse.json({ error: "Invalid order input", errors: validation.errors }, { status: 400 });
    }

    const parsedPacks = parsePackRequests(rawPacks);
    if (!parsedPacks.ok) {
      return NextResponse.json({ error: parsedPacks.error }, { status: 400 });
    }
    const packRequests = parsedPacks.requests;

    if (items.length === 0 && packRequests.length === 0) {
      return NextResponse.json({ error: "Cart items are required" }, { status: 400 });
    }

    if (packRequests.length > 0) {
      // Owner voucher sells at cost and would overwrite the pack price; manual admin orders are
      // priced by hand. Neither can be combined with packs.
      if (isOwnerVoucher) {
        return NextResponse.json({ error: "The owner voucher cannot be combined with packs" }, { status: 400 });
      }
      if (manualAdminOrder) {
        return NextResponse.json({ error: "Packs cannot be added to manual admin orders" }, { status: 400 });
      }
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
    const orderItems: ({
    perfumeId?: string;
    perfumeName: string;
    perfumeImage?: string;
    ml: number;
    isFullBottle?: boolean;
    fullBottleSize?: string;
    fullBottleCondition?: "new" | "partial";
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    costPrice: number;
    ownerName: string;
    isPersonalCollection?: boolean;
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
    } & Record<string, unknown>)[] = [];

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

    // ── Packs: load + verify + price server-side BEFORE touching any inventory ──
    // Each pack line expands into ordinary decant components (see lib/packs/order.ts) that run
    // through the same per-item pipeline below, so stock / owner / investor math is unchanged.
    let packLines: PackOrderLine[] = [];
    if (packRequests.length > 0) {
      const preparedPacks = await preparePackOrderLines(packRequests);
      if (!preparedPacks.ok) {
        return NextResponse.json(preparedPacks.body, { status: preparedPacks.status });
      }
      packLines = preparedPacks.lines;
    }
    // Server-created component items → pack metadata. WeakMap keyed by object identity so a
    // client-supplied cart item can never claim pack pricing.
    const packMetaByItem = new WeakMap<object, PackComponentMeta>();
    const packComponentItems = packLines.flatMap((line) =>
      line.components.map((component) => {
        packMetaByItem.set(component.item, component.meta);
        return component.item;
      }),
    );
    // With packs the order is written atomically (see transaction below), so inventory changes
    // are collected here instead of being applied mid-loop.
    const perfumeStockNeeds = new Map<string, number>();
    const bottleStockNeeds = new Map<string, number>();

    // Resolve manual catalog selections before any of the item writes. Custom bottles have no catalog ID.
    const manualPerfumes = new Map<string, FirebaseFirestore.DocumentSnapshot>();
    if (manualAdminOrder) {
      const ids = [...new Set(items.map(item => String(item.perfumeId || "").trim()).filter(Boolean))];
      if (ids.length) {
        const docs = await db.getAll(...ids.map(id => db.collection(Collections.perfumes).doc(id)));
        for (const doc of docs) {
          if (!doc.exists) {
            return NextResponse.json({ error: "The selected perfume is no longer in the catalog. Please select it again." }, { status: 409 });
          }
          manualPerfumes.set(doc.id, doc);
        }
      }
    }

    // Load bulk pricing rules — fetch all, filter/sort in memory to avoid composite index
    const bulkSnap = await db.collection(Collections.bulkPricingRules).get();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bulkRules = bulkSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r: any) => r.isActive === true).sort((a: any, b: any) => b.minQuantity - a.minQuantity) as any[];

    for (const item of [...items, ...packComponentItems]) {
      const packMeta = packMetaByItem.get(item);
      const isFullBottleItem = Boolean(item.isFullBottle);
      const requestedFullBottleSize = String(item.fullBottleSize || "").trim();
      const requestedFullBottleConditionRaw = String(item.fullBottleCondition || "").trim().toLowerCase();
      const requestedFullBottleMl = isFullBottleItem
        ? Number.parseFloat(requestedFullBottleSize.replace(/[^0-9.]/g, "")) || 0
        : Number(item.ml || 0);
      const customPerfumeName = String(item.perfumeName || "").trim();

      if (manualAdminOrder && isFullBottleItem && !customPerfumeName) {
        return NextResponse.json({ error: "Perfume name is required for manual full bottle orders" }, { status: 400 });
      }

      if (isFullBottleItem && requestedFullBottleConditionRaw && !["new", "partial"].includes(requestedFullBottleConditionRaw)) {
        return NextResponse.json({ error: "Full bottle condition must be either new or partial" }, { status: 400 });
      }

      if (!isFullBottleItem && !(requestedFullBottleMl > 0)) {
        return NextResponse.json({ error: "A valid ml value (greater than 0) is required for decant items" }, { status: 400 });
      }

      // Fetch perfume (replaces prisma.perfume.findUnique)
      const perfumeId = String(item.perfumeId || "").trim();
      const quantity = Number(item.quantity);
      if (!Number.isSafeInteger(quantity) || quantity <= 0) {
        return NextResponse.json({ error: "Quantity must be a positive whole number" }, { status: 400 });
      }
      let perfume: ({ id: string } & Record<string, unknown>) | null = null;
      let perfumeImage = "";
      if (perfumeId) {
        const perfumeDoc = manualPerfumes.get(perfumeId) ?? await db.collection(Collections.perfumes).doc(perfumeId).get();
        if (!perfumeDoc.exists) {
          return NextResponse.json({ error: "A selected perfume is no longer in the catalog. Refresh your order." }, { status: 409 });
        } else {
          perfume = { id: perfumeDoc.id, ...perfumeDoc.data() };
          const perfumeImages: string[] = (() => {
            try {
              return JSON.parse(String(perfume.images || "[]"));
            } catch {
              return [];
            }
          })();
          perfumeImage = normalizeOrderImagePath(perfumeImages[0]);
        }
      } else if (!manualAdminOrder || !isFullBottleItem) {
        return NextResponse.json({ error: "Select a catalog perfume for each item" }, { status: 400 });
      }

    // Fetch bottle (replaces prisma.bottleInventory.findUnique by ml)
    const bottleSnap = isFullBottleItem
      ? null
      : await db.collection(Collections.bottles).where("ml", "==", item.ml).limit(1).get();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bottle = bottleSnap && !bottleSnap.empty ? { id: bottleSnap.docs[0].id, ...bottleSnap.docs[0].data() } as any : null;
    const bottleCost = isFullBottleItem ? 0 : (bottle?.costPerBottle ?? 0);

    const isPersonalCollection = Boolean(perfume?.isPersonalCollection);
    const effectiveMarketPricePerMl = Number(perfume?.marketPricePerMl || 0);

    const fullBottlePrice = Number(effectiveMarketPricePerMl || 0) * 100;
    const tier = getBrandTier(fullBottlePrice);
    const profitMargin = getTierProfitMargin(tier, requestedFullBottleMl || item.ml, margins);
    const partialDealType = String(perfume?.partialDealType || "").toLowerCase();
    const isPartialDeal = partialDealType === "decant" || partialDealType === "full_bottle";
    const partialSellingPrice = Number(perfume?.partialSellingPrice ?? perfume?.partialSellingPricePerMl ?? 0);
    const inferredFullBottleCondition: "new" | "partial" = requestedFullBottleConditionRaw
      ? (requestedFullBottleConditionRaw as "new" | "partial")
      : (isFullBottleItem && partialDealType === "full_bottle" ? "partial" : "new");

    const adminProvidedUnitPrice = Number(item.unitPrice ?? item.sellingPrice ?? NaN);
    const adminProvidedUnitCost = Number(item.costPrice ?? item.buyingPrice ?? NaN);
    const hasAdminUnitPrice = manualAdminOrder && Number.isFinite(adminProvidedUnitPrice);
    const hasAdminUnitCost = manualAdminOrder && Number.isFinite(adminProvidedUnitCost);

    let unitPrice = isFullBottleItem
      ? (hasAdminUnitPrice ? Math.max(0, fromMinorUnits(toMinorUnits(adminProvidedUnitPrice))) : 0)
      : hasAdminUnitPrice
        ? Math.max(0, fromMinorUnits(toMinorUnits(adminProvidedUnitPrice)))
        : isPartialDeal
          ? Math.ceil(Math.max(0, partialSellingPrice))
          : calculateSellingPrice(
            effectiveMarketPricePerMl,
            requestedFullBottleMl,
            bottleCost,
            packagingCost,
            profitMargin,
          );

    // Apply bulk discount if applicable — skip when admin provided explicit pricing
    const bulkRule = !hasAdminUnitPrice && !packMeta
      ? bulkRules.find((r: { minQuantity: number }) => quantity >= r.minQuantity)
      : undefined;
    const discountPercent = bulkRule ? Number(bulkRule.discountPercent || 0) : 0;
    if (bulkRule) {
      unitPrice = Math.ceil(unitPrice * (1 - discountPercent / 100));
    }
    // Pack component: the pack discount is already baked into the allocated unit price
    // (computed from the NORMAL price — bulk pricing is intentionally skipped above).
    if (packMeta) {
      unitPrice = packMeta.allocatedUnitPrice;
    }

    const unitCost = isFullBottleItem
      ? (hasAdminUnitCost ? Math.max(0, fromMinorUnits(toMinorUnits(adminProvidedUnitCost))) : 0)
      : hasAdminUnitCost
        ? Math.max(0, fromMinorUnits(toMinorUnits(adminProvidedUnitCost)))
        : ((Number(perfume?.purchasePricePerMl || 0)) * requestedFullBottleMl + packagingCost + bottleCost);

    // Owner voucher override: sell at cost price (no profit).
    // Applied after bulk discount and cost calculation, but skipped for full-bottle
    // orders where the admin still needs to manually confirm final pricing later.
    if (isOwnerVoucher && !isFullBottleItem) {
      unitPrice = Math.max(0, fromMinorUnits(toMinorUnits(unitCost)));
    }

    if (isFullBottleItem && manualAdminOrder) {
      if (!Number.isFinite(Number(item.unitPrice ?? item.sellingPrice ?? NaN)) || !Number.isFinite(Number(item.costPrice ?? item.buyingPrice ?? NaN))) {
        return NextResponse.json({ error: "Buying and selling prices are required for manual full bottle orders" }, { status: 400 });
      }
    }
    const itemBreakdown = computeItemBreakdown({
      unitCostMinor: toMinorUnits(unitCost),
      unitSellingPriceMinor: toMinorUnits(unitPrice),
      quantity,
    });
    const totalPrice = fromMinorUnits(itemBreakdown.totalRevenueMinor);
    const costPrice = fromMinorUnits(itemBreakdown.totalCostMinor);
    // A person who paid for the bottle is repaid by hand, so the cost is kept out of Store revenue.
    const requestedPurchaserRaw = String(item.purchasedBy || "Store").trim() || "Store";
    if (requestedPurchaserRaw !== "Store" && requestedPurchaserRaw !== owner1Name && requestedPurchaserRaw !== owner2Name) {
      return NextResponse.json({ error: `Invalid purchaser "${requestedPurchaserRaw}"` }, { status: 400 });
    }
    const requestedPurchaser = requestedPurchaserRaw;
    const purchaserFields = requestedPurchaser !== "Store"
      ? { purchasedBy: requestedPurchaser, costRepaidManually: true }
      : { purchasedBy: "Store", costRepaidManually: false };
    const owner = String(perfume?.owner || "Store");
    const { ownerProfit, otherOwnerProfit } = calculateItemOwnerShares({
      ownerName: owner, isPersonalCollection, breakdown: itemBreakdown, unitCost,
      packagingCostPerUnit: Number(packagingCost) + Number(bottleCost),
      owner1Share, ownerProfitPercent: Number(settings?.ownerProfitPercent ?? 85),
    });

    if (!isFullBottleItem) {
      perfumeStockNeeds.set(perfumeId, (perfumeStockNeeds.get(perfumeId) || 0) + requestedFullBottleMl * quantity);
      if (bottle) bottleStockNeeds.set(bottle.id, (bottleStockNeeds.get(bottle.id) || 0) + quantity);
    }

      orderItems.push({
        ...(perfumeId ? { perfumeId } : {}),
        perfumeName: customPerfumeName || String(perfume?.name || "Custom Perfume"),
        perfumeImage,
        ml: requestedFullBottleMl,
        isFullBottle: isFullBottleItem,
        ...(isFullBottleItem ? { fullBottleSize: requestedFullBottleSize } : {}),
        ...(isFullBottleItem ? { fullBottleCondition: inferredFullBottleCondition } : {}),
        ...(isFullBottleItem && manualAdminOrder ? purchaserFields : {}),
        quantity,
        unitPrice,
        totalPrice,
        costPrice,
        ownerName: owner,
        isPersonalCollection,
        ownerProfit,
        otherOwnerProfit,
        financialBreakdown: itemBreakdown,
        pricingSnapshot: {
          costPricePerMl: Number(perfume?.purchasePricePerMl || 0),
          marketPricePerMl: Number(effectiveMarketPricePerMl || 0),
          bottleCost: Number(bottleCost || 0),
          packagingCost: Number(packagingCost || 0),
          appliedMarginPercent: Number(profitMargin || 0),
          partialDealType: isPartialDeal ? partialDealType : null,
          partialSellingPrice: isPartialDeal ? partialSellingPrice : null,
          discountPercent,
          pricingTier: tier,
        },
        ...(packMeta ? packMeta.itemFields : {}),
      });

      if (perfumeId) {
        orderCountByPerfume.set(perfumeId, (orderCountByPerfume.get(perfumeId) || 0) + quantity);
      }
    }

    if (orderItems.length === 0) {
      return NextResponse.json({ error: "No valid items found in cart" }, { status: 400 });
    }

    const subtotalMinor = orderItems.reduce((sum, item) => sum + item.financialBreakdown.totalRevenueMinor, 0);
    let discountMinor = orderDiscountMinor(subtotalMinor, "percentage", manualDiscountPercent ?? 0);
    let voucherVersion: FirebaseFirestore.Timestamp | undefined;
    let redeemedVoucherRef: FirebaseFirestore.DocumentReference | undefined;
    if (voucherCode && !isOwnerVoucher) {
      const voucherSnap = await db.collection(Collections.vouchers).where("code", "==", voucherCode).limit(1).get();
      const voucherDoc = voucherSnap.docs[0];
      const voucher = voucherDoc?.data();
      if (!voucher?.isActive || (voucher.expiresAt && (voucher.expiresAt.toMillis?.() ?? new Date(voucher.expiresAt).getTime()) < Date.now())
        || (voucher.usageLimit != null && Number(voucher.usedCount || 0) >= Number(voucher.usageLimit))) {
        return NextResponse.json({error: "Voucher unavailable"}, {status: 409});
      }
      const meetsMinimum = subtotalMinor >= toMinorUnits(Number(voucher.minOrderValue ?? 0));
      if (!meetsMinimum && !hasFullBottle) return NextResponse.json({error: "Voucher minimum order value not reached"}, {status: 400});
      voucherVersion = voucherDoc.updateTime;
      discountMinor = meetsMinimum ? orderDiscountMinor(subtotalMinor, voucher.discountType, Number(voucher.discountValue)) : 0;
      redeemedVoucherRef = voucherDoc.ref;
    }

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
    const payouts = calculateDiscountedPayouts(orderItems, pricingSnapshot.discountMinor, owner1Share, Number(settings?.ownerProfitPercent ?? 85));
    payouts.forEach((payout, index) => Object.assign(orderItems[index], {
      payoutIndex: index, payoutRevenue: payout.payoutRevenue, payoutOwner1Share: payout.payoutOwner1Share,
      ownerProfit: payout.ownerProfit, otherOwnerProfit: payout.otherOwnerProfit,
    }));
    const profitDistribution = distributeOrderProfit({
      items: payouts.map(payout => payout.distribution),
      owner1Name,
      owner2Name,
      owner1Share,
    });

    // Fetch global operational settings for pickup details
    const globalSettingsDoc = await db.collection(Collections.settings).doc("globalOperationalSettings").get();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const globalSettings = globalSettingsDoc.exists ? (globalSettingsDoc.data() as any) : null;
    const pickupContactNumber = pickupMethod === "Pickup" ? String(globalSettings?.pickup?.contactNumber || "") : "";
    const configuredEstimatedPrepTime = String(globalSettings?.pickup?.estimatedPrepTime || "").trim();
    const estimatedPrepTime = pickupMethod === "Pickup" ? (configuredEstimatedPrepTime || "1 day") : "";

    // Fetch pickup location address from DB
    let pickupLocationAddress = "";
    if (pickupMethod === "Pickup" && orderData.pickupLocationId) {
      const pickupLocDoc = await db.collection(Collections.pickupLocations).doc(String(orderData.pickupLocationId)).get();
      if (pickupLocDoc.exists) {
        pickupLocationAddress = String(pickupLocDoc.data()?.address || "");
      }
    }

    // Create order document (replaces prisma.order.create)
    const orderId = uuid();
    const now = Timestamp.now();
    const orderDoc = {
    ...orderData,
    entryType: "order",
    manualAdminOrder,
    userId: sessionUser?.id ?? null,
    isGuestOrder: !sessionUser,
    placedByEmail: sessionUser?.email || "",
    recipientEmail,
    customerEmail: recipientEmail,
    hasFullBottle,
    pickupMethod,
    deliveryZone: isDelivery ? deliveryZone : "",
    pickupLocationId: orderData.pickupLocationId || "",
    pickupLocationName: orderData.pickupLocationName || "",
    pickupLocationAddress,
    pickupContactNumber,
    estimatedPrepTime,
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
    voucherAppliedAt: redeemedVoucherRef ? now : null,
    recalculateDiscountOnEdit: true,
    useCatalogOwnershipOnEdit: true,
    payoutOwner1Share: owner1Share,
    ...(manualDiscountPercent > 0 ? { manualDiscountPercent } : {}),
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
    // Immutable pack snapshot (names, components, discount, prices at purchase time). Written after
    // the ...orderData spread; contains no cost/profit data. Historical views read THIS, never the live pack.
    ...(packLines.length > 0 ? { packs: packLines.map((line) => line.snapshot) } : {}),
    createdAt: now,
    updatedAt: now,
    };
    const itemIds = orderItems.map(() => uuid());

    {
      // Atomic: validate stock for EVERY affected perfume/atomiser, then write the order, all item
      // docs, the stock decrements and the totalOrders counters in one transaction. A shortage (or
      // any failure) leaves inventory and orders exactly as they were.
      try {
        await db.runTransaction(async (tx) => {
          const perfumeEntries = [...perfumeStockNeeds.entries()].map(([id, need]) => ({ ref: db.collection(Collections.perfumes).doc(id), need }));
          const bottleEntries = [...bottleStockNeeds.entries()].map(([id, need]) => ({ ref: db.collection(Collections.bottles).doc(id), need }));
          const [perfumeSnaps, bottleSnaps] = await Promise.all([
            perfumeEntries.length ? tx.getAll(...perfumeEntries.map((e) => e.ref)) : Promise.resolve([]),
            bottleEntries.length ? tx.getAll(...bottleEntries.map((e) => e.ref)) : Promise.resolve([]),
          ]);

          if (redeemedVoucherRef) {
            const current = await tx.get(redeemedVoucherRef);
            if (!current.exists || (voucherVersion && !voucherVersion.isEqual(current.updateTime!))) {
              throw new OrderStockError("Voucher availability changed. Please refresh your order.");
            }
            if (current.data()?.firstOrderOnly) {
              const previous = await tx.get(db.collection(Collections.orders).where("customerEmail", "==", recipientEmail).limit(1));
              if (!previous.empty) throw new OrderStockError("Voucher is for first orders only");
            }
          }
          perfumeSnaps.forEach((snap, i) => {
            const stock = Number(snap.data()?.totalStockMl ?? 0);
            if (!snap.exists || stock < perfumeEntries[i].need) {
              throw new OrderStockError(`Not enough stock for ${String(snap.data()?.name || "a perfume in your pack")}. Please update your cart.`);
            }
          });
          bottleSnaps.forEach((snap, i) => {
            const available = Number(snap.data()?.availableCount ?? 0);
            if (!snap.exists || available < bottleEntries[i].need) {
              throw new OrderStockError("Not enough atomisers in stock for this order. Please update your cart.");
            }
          });

          perfumeEntries.forEach((e) => tx.update(e.ref, { totalStockMl: FieldValue.increment(-e.need) }));
          bottleEntries.forEach((e) => tx.update(e.ref, { availableCount: FieldValue.increment(-e.need) }));
          orderCountByPerfume.forEach((count, perfumeId) => {
            tx.set(
              db.collection(Collections.perfumes).doc(perfumeId),
              { totalOrders: FieldValue.increment(count), lastOrderedAt: now, updatedAt: now },
              { merge: true },
            );
          });
          tx.set(db.collection(Collections.orders).doc(orderId), orderDoc);
          if (redeemedVoucherRef) tx.update(redeemedVoucherRef, { usedCount: FieldValue.increment(1) });
          orderItems.forEach((oi, index) => {
            tx.set(db.collection(Collections.orders).doc(orderId).collection("items").doc(itemIds[index]), { ...oi, orderId });
          });
        });
      } catch (error) {
        if (error instanceof OrderStockError) {
          invalidatePackCaches();
          return NextResponse.json({ code: "INSUFFICIENT_STOCK", error: error.message }, { status: 409 });
        }
        throw error;
      }
      // Stock changed → pack availability changed.
      invalidatePackCaches();
    }

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

    const createdItems = orderItems.map((item, index) => ({ ...item, id: itemIds[index] }));

    // Send confirmation email (awaited to prevent function termination in serverless environment)
    const customerEmail = String(orderDoc.customerEmail || "").trim();
    if (customerEmail) {
      const emailItems = createdItems.map((it) => {
        const isFullBottle = Boolean(it.isFullBottle);
        const conditionFromItem = String(it.fullBottleCondition || "").trim().toLowerCase();
        const conditionFromSnapshot = String((it.pricingSnapshot as { partialDealType?: unknown } | undefined)?.partialDealType || "").trim().toLowerCase();
        return {
        perfumeName: String(it.perfumeName || "Perfume"),
        quantity: Number(it.quantity || 0),
        ml: Number(it.ml || 0),
        unitPrice: Number(it.unitPrice || 0),
        ...pickPackEmailFields(it as Record<string, unknown>),
        isFullBottle,
        fullBottleSize: String(it.fullBottleSize || "").trim() || undefined,
        fullBottleCondition: isFullBottle
          ? (conditionFromItem === "partial" || conditionFromSnapshot === "full_bottle" ? "partial" : "new")
          : undefined,
        };
      });
      const emailNotification = pickupMethod === "Pickup" && pickupContactNumber
        ? generatePickupConfirmationEmail({
          orderId,
          customerName: String(orderData.customerName || "Customer"),
          customerEmail,
          items: emailItems,
          total,
          pickupContactNumber,
          estimatedPrepTime,
          pickupLocationName: String(orderData.pickupLocationName || ""),
          pickupLocationAddress,
        })
        : generateOrderConfirmationEmail({
          orderId,
          customerName: String(orderData.customerName || "Customer"),
          customerEmail,
          items: emailItems,
          subtotal,
          discount,
          deliveryFee,
          total,
          paymentMethod: normalizedPaymentMethod,
        });
      
      const templateName = pickupMethod === "Pickup" && pickupContactNumber
        ? "generatePickupConfirmationEmail"
        : "generateOrderConfirmationEmail";
      
      console.log(`[EMAIL] Sending ${templateName} to ${customerEmail}`);
      try {
        await sendEmail(emailNotification);
      } catch (error) {
        console.error(`[EMAIL ERROR] Failed for ${orderId}:`, error);
      }
    }

    // Send admin alert email
    const adminAlertItems = createdItems.map((it) => {
      const isFullBottle = Boolean(it.isFullBottle);
      const conditionFromItem = String(it.fullBottleCondition || "").trim().toLowerCase();
      const conditionFromSnapshot = String((it.pricingSnapshot as { partialDealType?: unknown } | undefined)?.partialDealType || "").trim().toLowerCase();
      return {
      perfumeName: String(it.perfumeName || "Perfume"),
      quantity: Number(it.quantity || 0),
      ml: Number(it.ml || 0),
      unitPrice: Number(it.unitPrice || 0),
      ...pickPackEmailFields(it as Record<string, unknown>),
      isFullBottle,
      fullBottleSize: String(it.fullBottleSize || "").trim() || undefined,
      fullBottleCondition: isFullBottle
        ? (conditionFromItem === "partial" || conditionFromSnapshot === "full_bottle" ? "partial" : "new")
        : undefined,
      };
    });
    try {
      await sendEmail(generateAdminNewOrderAlertEmail({
        orderId,
        customerName: String(orderDoc.customerName || "Customer"),
        customerEmail: String(orderDoc.customerEmail || ""),
        items: adminAlertItems,
        total,
        paymentMethod: normalizedPaymentMethod,
        pickupMethod,
        deliveryZone: String(orderDoc.deliveryZone || ""),
        area: String(orderDoc.area || ""),
      }));
    } catch (error) {
      console.error(`[EMAIL] Admin alert failed for ${orderId}:`, error);
    }

    return NextResponse.json(serializeDoc({ id: orderId, ...orderDoc, items: createdItems }), { status: 201 });
  } catch (error) {
    console.error("Order POST error:", error);
    const message = error instanceof Error ? error.message : "Failed to place order";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
