export type MoneyMinor = number;

export type OwnerShare = {
  ownerId: string;
  percentage: number;
  profitAmountMinor: MoneyMinor;
};

export type ItemFinancialBreakdown = {
  unitCostMinor: MoneyMinor;
  unitSellingPriceMinor: MoneyMinor;
  quantity: number;
  totalCostMinor: MoneyMinor;
  totalRevenueMinor: MoneyMinor;
  computedProfitMinor: MoneyMinor;
};

export type PricingSnapshot = {
  pricingVersion: number;
  currency: "BDT";
  subtotalMinor: MoneyMinor;
  discountMinor: MoneyMinor;
  deliveryFeeMinor: MoneyMinor;
  totalMinor: MoneyMinor;
  totalCostMinor: MoneyMinor;
  totalProfitMinor: MoneyMinor;
  generatedAt: Date;
};

export function toMinorUnits(value: number): MoneyMinor {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

export function fromMinorUnits(value: MoneyMinor): number {
  if (!Number.isFinite(value)) return 0;
  return Number((value / 100).toFixed(2));
}

export function clampMinor(value: MoneyMinor, min = 0): MoneyMinor {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.round(value));
}

export function splitProfitMinor(profitMinor: MoneyMinor, ownerPercent: number): {
  ownerProfitMinor: MoneyMinor;
  otherOwnerProfitMinor: MoneyMinor;
} {
  const safeProfit = clampMinor(profitMinor, 0);
  if (safeProfit <= 0) {
    return { ownerProfitMinor: 0, otherOwnerProfitMinor: 0 };
  }

  const boundedPercent = Math.min(100, Math.max(0, Number(ownerPercent) || 0));
  const ownerProfitMinor = Math.round(safeProfit * (boundedPercent / 100));
  return {
    ownerProfitMinor,
    otherOwnerProfitMinor: safeProfit - ownerProfitMinor,
  };
}

export function computeItemBreakdown(params: {
  unitCostMinor: MoneyMinor;
  unitSellingPriceMinor: MoneyMinor;
  quantity: number;
}): ItemFinancialBreakdown {
  const quantity = Math.max(0, Math.floor(Number(params.quantity) || 0));
  const unitCostMinor = clampMinor(params.unitCostMinor, 0);
  const unitSellingPriceMinor = clampMinor(params.unitSellingPriceMinor, 0);
  const totalCostMinor = unitCostMinor * quantity;
  const totalRevenueMinor = unitSellingPriceMinor * quantity;

  return {
    unitCostMinor,
    unitSellingPriceMinor,
    quantity,
    totalCostMinor,
    totalRevenueMinor,
    computedProfitMinor: totalRevenueMinor - totalCostMinor,
  };
}

export function buildOrderPricingSnapshot(params: {
  subtotalMinor: MoneyMinor;
  discountMinor: MoneyMinor;
  deliveryFeeMinor: MoneyMinor;
  totalCostMinor: MoneyMinor;
  generatedAt?: Date;
}): PricingSnapshot {
  const subtotalMinor = clampMinor(params.subtotalMinor, 0);
  const deliveryFeeMinor = clampMinor(params.deliveryFeeMinor, 0);
  const discountMinor = clampMinor(Math.min(params.discountMinor, subtotalMinor), 0);
  const totalMinor = Math.max(0, subtotalMinor - discountMinor) + deliveryFeeMinor;
  const totalCostMinor = clampMinor(params.totalCostMinor, 0);
  const totalProfitMinor = (totalMinor - deliveryFeeMinor) - totalCostMinor;

  return {
    pricingVersion: 1,
    currency: "BDT",
    subtotalMinor,
    discountMinor,
    deliveryFeeMinor,
    totalMinor,
    totalCostMinor,
    totalProfitMinor,
    generatedAt: params.generatedAt ?? new Date(),
  };
}

export function distributeOrderProfit(params: {
  items: Array<{
    ownerName: string;
    computedProfitMinor: MoneyMinor;
    ownerProfitMinor: MoneyMinor;
    otherOwnerProfitMinor: MoneyMinor;
  }>;
  owner1Name: string;
  owner2Name: string;
  owner1Share: number;
}): OwnerShare[] {
  const map = new Map<string, number>();

  const add = (ownerId: string, amountMinor: number) => {
    if (!ownerId) return;
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) return;
    map.set(ownerId, (map.get(ownerId) || 0) + Math.round(amountMinor));
  };

  for (const item of params.items) {
    const ownerName = String(item.ownerName || "Store");
    if (ownerName === "Store") {
      const storeProfit = Math.max(0, Math.round(item.computedProfitMinor || 0));
      if (storeProfit <= 0) continue;
      const owner1Amount = Math.round(storeProfit * ((Number(params.owner1Share) || 0) / 100));
      const owner2Amount = storeProfit - owner1Amount;
      add(params.owner1Name, owner1Amount);
      add(params.owner2Name, owner2Amount);
      continue;
    }

    add(ownerName, item.ownerProfitMinor || 0);
    const otherOwner = ownerName === params.owner1Name ? params.owner2Name : params.owner1Name;
    add(otherOwner, item.otherOwnerProfitMinor || 0);
  }

  const total = Array.from(map.values()).reduce((sum, amount) => sum + amount, 0);

  return Array.from(map.entries()).map(([ownerId, profitAmountMinor]) => ({
    ownerId,
    percentage: total > 0 ? Number(((profitAmountMinor / total) * 100).toFixed(4)) : 0,
    profitAmountMinor,
  }));
}
