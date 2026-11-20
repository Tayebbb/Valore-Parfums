import { FieldValue, Timestamp, type DocumentData } from "firebase-admin/firestore";
import { v4 as uuid } from "uuid";
import { Collections, db } from "@/lib/prisma";
import { buildOrderPricingSnapshot, computeItemBreakdown, distributeOrderProfit, fromMinorUnits, orderDiscountMinor, toMinorUnits } from "@/lib/finance";
import { calculateDiscountedPayouts, calculateItemOwnerShares, calculatePersonalBottleEarnings } from "@/lib/ownerEarnings";
import { normalizeOrderStatus } from "@/lib/orderStatusConfig";
import { splitProfit, type OwnerType } from "@/lib/utils";

type AddedItem = {
  perfumeName: string;
  perfumeId?: string;
  ml: number;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  isFullBottle?: boolean;
  fullBottleSize?: string;
  fullBottleCondition?: "new" | "partial";
};
type PriceUpdate = { itemId: string; unitPrice: number; buyingPrice?: number };
export type OrderPricingEdit = {
  addItems?: AddedItem[];
  removeItemIds?: string[];
  itemPriceUpdates?: PriceUpdate[];
  removeVoucher?: boolean;
};
type Owners = { owner1Name: string; owner2Name: string; owner1Share: number; ownerProfitPercent: number };
type CatalogSource = { perfume: DocumentData; packagingCost: number; bottleCost: number };
export const lockedOrderStatuses = new Set(["Dispatched", "Delivered", "Cancelled"]);
export class OrderEditError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

function buildAddedItem(input: AddedItem, owners: Owners, now: Timestamp, atCost: boolean, source?: CatalogSource) {
  const perfumeName = String(input.perfumeName || "").trim();
  if (!perfumeName) return null;
  const perfumeId = String(input.perfumeId || "").trim();
  const isFullBottle = Boolean(input.isFullBottle);
  const fullBottleSize = String(input.fullBottleSize || "").trim();
  if (isFullBottle && !fullBottleSize) throw new OrderEditError("Full bottle size is required for full bottle items");
  const ml = (isFullBottle && parseFloat(fullBottleSize.replace(/[^0-9.]/g, ""))) || Number(input.ml) || 0;
  if (!isFullBottle && (!Number.isFinite(ml) || ml <= 0)) return null;
  const quantity = Math.max(1, Math.floor(Number(input.quantity) || 1));
  const unitCost = Math.max(0, fromMinorUnits(toMinorUnits(Number(input.costPrice))));
  const unitPrice = atCost ? unitCost : Math.max(0, fromMinorUnits(toMinorUnits(Number(input.unitPrice))));
  const financialBreakdown = computeItemBreakdown({
    unitSellingPriceMinor: toMinorUnits(unitPrice), unitCostMinor: toMinorUnits(unitCost), quantity,
  });
  const totalPrice = fromMinorUnits(financialBreakdown.totalRevenueMinor);
  const costPrice = fromMinorUnits(financialBreakdown.totalCostMinor);
  const ownerName = String(source?.perfume.owner || "Store");
  const isPersonalCollection = Boolean(source?.perfume.isPersonalCollection);
  const shares = source
    ? calculateItemOwnerShares({
        ownerName, isPersonalCollection, breakdown: financialBreakdown, unitCost,
        packagingCostPerUnit: source.packagingCost + source.bottleCost,
        ownerProfitPercent: owners.ownerProfitPercent, owner1Share: owners.owner1Share,
      })
    : splitProfit(totalPrice - costPrice, "Store", owners.ownerProfitPercent, owners.owner1Share);
  return {
    perfumeName, ...(perfumeId ? { perfumeId } : {}), ml, quantity, unitPrice, totalPrice, costPrice, isFullBottle,
    ...(isFullBottle ? { fullBottleSize, fullBottleCondition: input.fullBottleCondition === "partial" ? "partial" : "new" } : {}),
    ownerName, ...shares,
    ...(source ? { isPersonalCollection, pricingSnapshot: {
      unitCost, unitSellingPrice: unitPrice, costPricePerMl: Number(source.perfume.purchasePricePerMl ?? 0),
      packagingCost: source.packagingCost, bottleCost: source.bottleCost,
    } } : {}),
    financialBreakdown, addedByAdmin: true, createdAt: now, updatedAt: now,
  };
}

function repriceFullBottle(item: DocumentData, input: PriceUpdate, owners: Owners, atCost: boolean, now: Timestamp) {
  if (!item.isFullBottle) throw new OrderEditError("Manual pricing updates are allowed only for Full Bottle items");
  const sellingPrice = Number(input.unitPrice);
  if (!Number.isFinite(sellingPrice) || sellingPrice < 0) throw new OrderEditError("Invalid full bottle price input");
  const quantity = Number(item.quantity ?? 0);
  const pricing = item.pricingSnapshot;
  let unitCost = Number(pricing?.unitCost ?? (item.financialBreakdown?.unitCostMinor !== undefined
    ? fromMinorUnits(item.financialBreakdown.unitCostMinor) : Number(item.costPrice ?? 0) / Math.max(1, quantity)));
  if (input.buyingPrice != null) {
    if (!Number.isFinite(Number(input.buyingPrice)) || Number(input.buyingPrice) < 0) throw new OrderEditError("Invalid full bottle buying price input");
    unitCost = fromMinorUnits(toMinorUnits(Number(input.buyingPrice)));
  }
  const unitPrice = atCost ? unitCost : fromMinorUnits(toMinorUnits(sellingPrice));
  const financialBreakdown = computeItemBreakdown({
    unitCostMinor: toMinorUnits(unitCost), unitSellingPriceMinor: toMinorUnits(unitPrice), quantity,
  });
  const totalPrice = fromMinorUnits(financialBreakdown.totalRevenueMinor);
  const costPrice = fromMinorUnits(financialBreakdown.totalCostMinor);
  const ownerName = (item.ownerName || "Store") as OwnerType;
  let { ownerProfit, otherOwnerProfit } = splitProfit(totalPrice - costPrice, ownerName, owners.ownerProfitPercent, owners.owner1Share);
  if (item.isPersonalCollection && ownerName !== "Store" && pricing) {
    const packaging = Number(pricing.packagingCost ?? 0) + Number(pricing.bottleCost ?? 0);
    const earnings = calculatePersonalBottleEarnings({
      sellingPrice: totalPrice, packagingCost: packaging * quantity, productCost: Math.max(0, unitCost - packaging) * quantity,
    });
    ownerProfit = earnings.bottleOwnerEarnings;
    otherOwnerProfit = earnings.otherOwnerEarnings;
  }
  return {
    unitPrice, totalPrice, costPrice, financialBreakdown, ownerProfit, otherOwnerProfit, updatedAt: now,
    pricingSnapshot: { ...pricing, unitCost, unitSellingPrice: unitPrice },
  };
}

/** Commit item changes, the voucher redemption and the corresponding invoice together. */
export async function applyOrderPricingEdit(id: string, edit: OrderPricingEdit, deliveryFee: number | undefined, owners: Owners & { packagingCost: number }) {
  const orderRef = db.collection(Collections.orders).doc(id);
  const itemsRef = orderRef.collection("items");
  const now = Timestamp.now();
  await db.runTransaction(async tx => {
    const order = (await tx.get(orderRef)).data();
    if (!order) throw new OrderEditError("Order not found", 404);
    const status = normalizeOrderStatus(order.status || "Pending", order.pickupMethod);
    if (order.profitCreditedAt || lockedOrderStatuses.has(status)) throw new OrderEditError(`Financial fields are locked for ${status} orders`, 409);
    const snapshot = await tx.get(itemsRef);
    const items = new Map(snapshot.docs.map(doc => [doc.id, doc.data()]));
    const removals = new Set((edit.removeItemIds ?? []).map(id => String(id).trim()));
    const removedPackIds = new Set<string>();
    for (const [id, item] of items) {
      if (removals.has(id) && item.packGroupId) removedPackIds.add(item.packGroupId);
    }
    for (const [id, item] of items) {
      if (removedPackIds.has(item.packGroupId) && !removals.has(id)) {
        throw new OrderEditError("A pack must be removed as a whole — remove every item of the pack together.", 409);
      }
    }

    const code = String(order.voucherCode || "").trim();
    const ownerCode = (process.env.OWNER_VOUCHER_CODE || "VALORE1290").trim().toUpperCase();
    const atCost = Boolean(code && code.toUpperCase() === ownerCode);
    // Only orders created with this policy may recalculate an agreed discount.
    const itemsEdited = Boolean(edit.addItems?.length || edit.removeItemIds?.length || edit.itemPriceUpdates?.length);
    const pendingFirstQuote = order.hasFullBottle && !Number(order.subtotal) && !Number(order.discount) && Boolean(edit.itemPriceUpdates?.length);
    const repriceDiscount = (order.recalculateDiscountOnEdit === true || pendingFirstQuote) && itemsEdited;
    const voucherDoc = (repriceDiscount || edit.removeVoucher) && code && !atCost
      ? (await tx.get(db.collection(Collections.vouchers).where("code", "==", code).limit(1))).docs[0] : undefined;
    // Firestore transactions require every read to precede the writes.
    const additions = edit.addItems ?? [];
    const catalogIds = [...new Set(additions.map(input => String(input.perfumeId || "").trim()).filter(Boolean))];
    const perfumes = new Map<string, DocumentData>();
    if (catalogIds.length) {
      const docs = await tx.getAll(...catalogIds.map(id => db.collection(Collections.perfumes).doc(id)));
      for (const doc of docs) {
        const perfume = doc.data();
        if (!perfume) throw new OrderEditError("The selected perfume is no longer in the catalog. Please select it again.", 409);
        perfumes.set(doc.id, perfume);
      }
    }
    const bottleSizes = new Set<number>();
    for (const id of removals) {
      const item = items.get(id);
      if (item && (!item.addedByAdmin || item.inventoryReserved) && !item.isFullBottle && item.perfumeId && item.ml > 0 && item.quantity > 0) {
        bottleSizes.add(Number(item.ml));
      }
    }
    for (const input of additions) {
      if (!input.isFullBottle && Number(input.ml) > 0 && perfumes.has(String(input.perfumeId || "").trim())) {
        bottleSizes.add(Number(input.ml));
      }
    }
    const bottles = new Map(await Promise.all([...bottleSizes].map(async ml => {
      const bottle = await tx.get(db.collection(Collections.bottles).where("ml", "==", ml).limit(1));
      return [ml, bottle.docs[0]] as const;
    })));
    const returnedMl = new Map<string, number>();
    const returnedBottles = new Map<number, number>();
    for (const id of removals) {
      const item = items.get(id);
      if (!item) continue;
      if ((!item.addedByAdmin || item.inventoryReserved) && !item.isFullBottle && item.perfumeId && item.ml > 0 && item.quantity > 0) {
        returnedMl.set(item.perfumeId, (returnedMl.get(item.perfumeId) ?? 0) + item.ml * item.quantity);
        returnedBottles.set(Number(item.ml), (returnedBottles.get(Number(item.ml)) ?? 0) + Number(item.quantity));
        tx.update(db.collection(Collections.perfumes).doc(String(item.perfumeId)), { totalStockMl: FieldValue.increment(item.ml * item.quantity) });
        const bottle = bottles.get(Number(item.ml));
        if (bottle) tx.update(bottle.ref, { availableCount: FieldValue.increment(Number(item.quantity)) });
      }
      items.delete(id);
      tx.delete(itemsRef.doc(id));
    }
    for (const input of additions) {
      const perfume = perfumes.get(String(input.perfumeId || "").trim());
      const source = perfume ? {
        perfume, packagingCost: owners.packagingCost,
        bottleCost: input.isFullBottle ? 0 : Number(bottles.get(Number(input.ml))?.data().costPerBottle ?? 0),
      } : undefined;
      const item = buildAddedItem(input, owners, now, atCost && repriceDiscount, source);
      if (!item) continue;
      if (perfume && !item.isFullBottle && item.perfumeId) {
        const mlLeft = (returnedMl.get(item.perfumeId) ?? 0) - item.ml * item.quantity;
        const bottlesLeft = (returnedBottles.get(item.ml) ?? 0) - item.quantity;
        const bottle = bottles.get(item.ml);
        if (Number(perfume.totalStockMl ?? 0) + mlLeft < 0 || (bottle && Number(bottle.data().availableCount ?? 0) + bottlesLeft < 0)) {
          throw new OrderEditError("Insufficient stock for " + item.perfumeName, 409);
        }
        returnedMl.set(item.perfumeId, mlLeft);
        returnedBottles.set(item.ml, bottlesLeft);
        tx.update(db.collection(Collections.perfumes).doc(item.perfumeId), { totalStockMl: FieldValue.increment(-item.ml * item.quantity) });
        if (bottle) tx.update(bottle.ref, { availableCount: FieldValue.increment(-item.quantity) });
      }
      const ref = itemsRef.doc(uuid());
      const savedItem = { ...item, inventoryReserved: Boolean(perfume && !item.isFullBottle && item.perfumeId) };
      items.set(ref.id, savedItem);
      tx.set(ref, savedItem);
    }
    for (const update of edit.itemPriceUpdates ?? []) {
      const item = items.get(update.itemId);
      if (!item) continue;
      const patch = repriceFullBottle(item, update, owners, atCost, now);
      items.set(update.itemId, { ...item, ...patch });
      tx.update(itemsRef.doc(update.itemId), patch);
    }

    let subtotalMinor = 0;
    let totalCostMinor = 0;
    const distributionItems: Parameters<typeof distributeOrderProfit>[0]["items"] = [];
    for (const item of items.values()) {
      const breakdown = item.financialBreakdown;
      const hasBreakdown = Number.isFinite(breakdown?.totalRevenueMinor) && Number.isFinite(breakdown?.totalCostMinor);
      const revenue = hasBreakdown ? Number(breakdown.totalRevenueMinor) : toMinorUnits(Number(item.totalPrice ?? 0));
      const cost = hasBreakdown ? Number(breakdown.totalCostMinor) : toMinorUnits(Number(item.costPrice ?? 0));
      subtotalMinor += revenue;
      totalCostMinor += cost;
      distributionItems.push({
        ownerName: String(item.ownerName || "Store"),
        computedProfitMinor: Number(breakdown?.computedProfitMinor ?? revenue - cost),
        ownerProfitMinor: toMinorUnits(Number(item.ownerProfit || 0)),
        otherOwnerProfitMinor: toMinorUnits(Number(item.otherOwnerProfit || 0)),
      });
    }
    let discountMinor = toMinorUnits(Number(order.discount ?? 0));
    if (edit.removeVoucher && code) {
      discountMinor = 0;
    } else if (repriceDiscount) {
      discountMinor = orderDiscountMinor(subtotalMinor, "percentage", order.manualAdminOrder ? Number(order.manualDiscountPercent || 0) : 0);
    }
    let voucherAppliedAt = order.voucherAppliedAt ?? null;
    if (voucherDoc) {
      const voucher = voucherDoc.data();
      const usedCount = Number(voucher.usedCount || 0);
      // Older checkout versions counted the voucher (including unpriced full bottles)
      // at creation without saving voucherAppliedAt.
      const alreadyCounted = Boolean(voucherAppliedAt) || Number(order.discount) > 0 ||
        (order.voucherAppliedAt === undefined && order.hasFullBottle && order.subtotal === 0 && usedCount > 0);
      if (edit.removeVoucher) {
        if (alreadyCounted && usedCount > 0) tx.update(voucherDoc.ref, { usedCount: FieldValue.increment(-1) });
      } else {
        if (alreadyCounted) voucherAppliedAt ??= order.createdAt ?? now;
        const expires = voucher.expiresAt ?? voucher.expiryDate;
        const expiresMs = expires?.toMillis?.() ?? (expires ? new Date(expires).getTime() : Infinity);
        const hasUse = alreadyCounted || voucher.usageLimit == null || usedCount < Number(voucher.usageLimit);
        if (voucher.isActive && expiresMs >= now.toMillis() && hasUse && subtotalMinor >= toMinorUnits(Number(voucher.minOrderValue ?? 0))) {
          discountMinor = orderDiscountMinor(subtotalMinor, voucher.discountType, Number(voucher.discountValue));
          if (!alreadyCounted && discountMinor > 0) {
            tx.update(voucherDoc.ref, { usedCount: FieldValue.increment(1) });
            voucherAppliedAt = now;
          }
        }
      }
    }
    const pricing = buildOrderPricingSnapshot({
      subtotalMinor, totalCostMinor, discountMinor, deliveryFeeMinor: toMinorUnits(deliveryFee ?? Number(order.deliveryFee ?? 0)),
    });
    const bookedShare = Number(order.payoutOwner1Share ?? owners.owner1Share);
    if ((itemsEdited || edit.removeVoucher) && order.payoutOwner1Share != null) {
      const entries = [...items.entries()].sort(([left, a], [right, b]) => (a.payoutIndex ?? Infinity) - (b.payoutIndex ?? Infinity) || left.localeCompare(right));
      const payouts = calculateDiscountedPayouts(entries.map(([, item]) => item), pricing.discountMinor, bookedShare, owners.ownerProfitPercent);
      distributionItems.length = 0;
      payouts.forEach(({distribution, ...fields}, index) => {
        distributionItems.push(distribution);
        tx.update(itemsRef.doc(entries[index][0]), fields);
      });
    }
    tx.update(orderRef, {
      ...(itemsEdited ? { hasFullBottle: [...items.values()].some(item => item.isFullBottle) } : {}),
      ...(removedPackIds.size && Array.isArray(order.packs) ? { packs: order.packs.filter(p => !removedPackIds.has(p.packGroupId)) } : {}),
      ...(edit.removeVoucher && code ? { voucherCode: null, voucherAppliedAt: null } : {}),
      ...(voucherAppliedAt && !order.voucherAppliedAt && !edit.removeVoucher ? { voucherAppliedAt } : {}),
      discount: fromMinorUnits(pricing.discountMinor),
      subtotal: fromMinorUnits(pricing.subtotalMinor),
      total: fromMinorUnits(pricing.totalMinor),
      deliveryFee: fromMinorUnits(pricing.deliveryFeeMinor),
      profit: fromMinorUnits(pricing.totalProfitMinor),
      ...("totalAmount" in order ? { totalAmount: fromMinorUnits(subtotalMinor) } : {}),
      ...("finalAmount" in order ? { finalAmount: fromMinorUnits(pricing.totalMinor) } : {}),
      pricingSnapshot: { ...pricing, generatedAt: now },
      financialsMinor: {
        subtotalMinor: pricing.subtotalMinor,
        totalCostMinor: pricing.totalCostMinor,
        discountMinor: pricing.discountMinor,
        deliveryFeeMinor: pricing.deliveryFeeMinor,
        totalMinor: pricing.totalMinor,
        totalProfitMinor: pricing.totalProfitMinor,
      },
      ...(itemsEdited || edit.removeVoucher || !order.profitDistribution ? { profitDistribution: distributeOrderProfit({ items: distributionItems, ...owners, owner1Share: bookedShare }) } : {}),
      updatedAt: now,
    });
  });
}
