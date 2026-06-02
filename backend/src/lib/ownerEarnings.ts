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

/**
 * Returns true when a product's bottle source is the personal collection of an owner.
 * Accepts the raw string stored on the perfume document.
 */
export function isPersonalBottle(source: string): boolean {
  return source === "personal_collection";
}
