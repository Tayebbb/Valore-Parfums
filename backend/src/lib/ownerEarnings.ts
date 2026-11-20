import { fromMinorUnits, toMinorUnits, splitProfitMinor, type ItemFinancialBreakdown } from "./finance";

/**
 * Pure earnings calculations for personal-collection bottle sales.
 *
 * "Personal collection" means the owner contributes their own bottle/liquid.
 * In that case the owner must first recover the cost of the liquid (productCost)
 * before the remaining profit is split 85 / 15 between bottle-owner and other-owner.
 */

export interface PersonalBottleEarningInput {
  /** Amount charged to the customer (total for the line, all units) */
  sellingPrice: number;
  /** Bottle, sprayer, and packaging cost (total for the line, all units) */
  packagingCost: number;
  /** Cost / value of the liquid drawn from the owner's bottle (all units) */
  productCost: number;
}

export interface PersonalBottleEarningResult {
  /** sellingPrice − packagingCost */
  netSaleAmount: number;
  /** netSaleAmount − productCost */
  profit: number;
  /** productCost + (profit × 0.85) — bottle owner recovers liquid cost first */
  bottleOwnerEarnings: number;
  /** profit × 0.15 — other owner's share */
  otherOwnerEarnings: number;
  /** sellingPrice — unchanged for revenue tracking */
  totalRevenue: number;
}

function round2(val: number): number {
  return Math.round(val * 100) / 100;
}

export function calculatePersonalBottleEarnings(
  input: PersonalBottleEarningInput,
): PersonalBottleEarningResult {
  const { sellingPrice, packagingCost, productCost } = input;

  const netSaleAmount = round2(sellingPrice - packagingCost);
  const profit = round2(netSaleAmount - productCost);
  const bottleOwnerEarnings = round2(productCost + profit * 0.85);
  const otherOwnerEarnings = round2(profit * 0.15);
  const totalRevenue = round2(sellingPrice);

  return { netSaleAmount, profit, bottleOwnerEarnings, otherOwnerEarnings, totalRevenue };
}

export function calculateItemOwnerShares(input: {
  ownerName: string;
  isPersonalCollection: boolean;
  breakdown: ItemFinancialBreakdown;
  unitCost: number;
  packagingCostPerUnit: number;
  owner1Share: number;
  ownerProfitPercent: number;
}): { ownerProfit: number; otherOwnerProfit: number } {
  const { ownerName, breakdown, unitCost, packagingCostPerUnit } = input;
  if (ownerName !== "Store" && input.isPersonalCollection) {
    const earnings = calculatePersonalBottleEarnings({
      sellingPrice: fromMinorUnits(breakdown.totalRevenueMinor),
      packagingCost: packagingCostPerUnit * breakdown.quantity,
      productCost: Math.max(0, unitCost - packagingCostPerUnit) * breakdown.quantity,
    });
    return { ownerProfit: earnings.bottleOwnerEarnings, otherOwnerProfit: earnings.otherOwnerEarnings };
  }
  const share = ownerName === "Store" ? input.owner1Share : input.ownerProfitPercent;
  const split = splitProfitMinor(breakdown.computedProfitMinor, share);
  return { ownerProfit: fromMinorUnits(split.ownerProfitMinor), otherOwnerProfit: fromMinorUnits(split.otherOwnerProfitMinor) };
}

/**
 * Returns true when a product's bottle source is the personal collection of an owner.
 * Accepts the raw string stored on the perfume document.
 */
export function isPersonalBottle(source: string): boolean {
  return source === "personal_collection";
}

// Apportion in minor units; cumulative rounding makes the line discounts sum to the invoice discount.
export function calculateDiscountedPayouts(
  items: Array<{ totalPrice?: number; costPrice?: number; quantity?: number; ownerName?: string; isPersonalCollection?: boolean;
    pricingSnapshot?: { packagingCost?: number; bottleCost?: number }; ownerProfit?: number; otherOwnerProfit?: number }>,
  discountMinor: number, owner1Share: number, ownerProfitPercent: number,
) {
  const subtotal = items.reduce((sum, item) => sum + toMinorUnits(Number(item.totalPrice ?? 0)), 0);
  let cumulative = 0;
  let allocated = 0;
  return items.map(item => {
    const gross = toMinorUnits(Number(item.totalPrice ?? 0));
    cumulative += gross;
    const throughLine = subtotal ? Math.round(Math.min(discountMinor, subtotal) * cumulative / subtotal) : 0;
    const net = gross - (throughLine - allocated);
    allocated = throughLine;
    const cost = toMinorUnits(Number(item.costPrice ?? 0));
    const netProfit = net - cost;
    const ownerName = item.ownerName || "Store";
    let shares = splitProfitMinor(netProfit, ownerName === "Store" ? owner1Share : ownerProfitPercent);
    if (ownerName !== "Store" && item.isPersonalCollection) {
      const packaging = toMinorUnits((Number(item.pricingSnapshot?.packagingCost ?? 0) + Number(item.pricingSnapshot?.bottleCost ?? 0)) * Number(item.quantity ?? 1));
      const proceeds = Math.max(0, net - packaging);
      const recovery = Math.min(proceeds, Math.max(0, cost - packaging));
      shares = splitProfitMinor(proceeds - recovery, 85);
      shares.ownerProfitMinor += recovery;
    }
    return {
      payoutRevenue: fromMinorUnits(net), payoutOwner1Share: owner1Share,
      ownerProfit: fromMinorUnits(shares.ownerProfitMinor), otherOwnerProfit: fromMinorUnits(shares.otherOwnerProfitMinor),
      distribution: { ownerName, computedProfitMinor: netProfit, ...shares },
    };
  });
}
