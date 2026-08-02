// ─── Inventory Investment System — pure financial engine ───────
// Two-stream model:
//   Stream A (capital recovery): perfume cost of each sale returns the
//     investor's capital at the lot's locked cost basis. NOT profit.
//   Stream B (profit): net profit = selling price − selling costs − perfume
//     cost, split investor/business by profitSharePercentage.
// INVARIANT (per investment, at all times):
//   amountMinor === recoveredCapitalMinor + remainingInventoryCostMinor
// All functions are pure and integer-safe (minor units). No I/O.

import type {
  SaleAllocationInput,
  SaleAllocationResult,
  SaleSplitInput,
  SaleSplitResult,
} from "./types";

function assertInt(value: number, label: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`Investment finance: ${label} must be an integer (got ${value})`);
  }
}

/** Capital cost of `ml` at a lot's locked basis. */
export function calculatePerfumeCost(ml: number, costPerMlMinor: number): number {
  assertInt(costPerMlMinor, "costPerMlMinor");
  if (ml < 0) throw new Error("Investment finance: ml must be >= 0");
  return Math.round(ml * costPerMlMinor);
}

/** Total selling costs (bottle + atomizer + label + packaging + pouch + …). */
export function calculateSellingCosts(componentsMinor: number[]): number {
  return componentsMinor.reduce((sum, c) => {
    assertInt(c, "selling cost component");
    if (c < 0) throw new Error("Investment finance: selling cost cannot be negative");
    return sum + c;
  }, 0);
}

/**
 * Consume `mlToSell` from lots FIFO (array must already be ordered
 * oldest-first). Returns per-lot consumption with capital amounts.
 * Throws when funded stock is insufficient — caller decides fallback.
 */
export function allocateSaleFifo(
  lots: SaleAllocationInput[],
  mlToSell: number
): SaleAllocationResult[] {
  if (mlToSell <= 0) throw new Error("Investment finance: mlToSell must be > 0");
  const results: SaleAllocationResult[] = [];
  let remaining = mlToSell;
  for (const lot of lots) {
    if (remaining <= 0) break;
    if (lot.remainingMl <= 0) continue;
    const take = Math.min(lot.remainingMl, remaining);
    results.push({
      allocationId: lot.allocationId,
      mlConsumed: take,
      capitalMinor: calculatePerfumeCost(take, lot.costPerMlMinor),
    });
    remaining -= take;
  }
  if (remaining > 0) {
    throw new Error(
      `Investment finance: insufficient funded stock (short ${remaining} ml)`
    );
  }
  return results;
}

/**
 * Split one sale into the two streams.
 * netProfit may be negative (sold below cost); capital recovery still happens
 * in full — losses reduce profit, never recorded capital.
 */
export function splitSale(input: SaleSplitInput): SaleSplitResult {
  const { sellingPriceMinor, sellingCostsMinor, perfumeCostMinor, investorSharePercent } = input;
  assertInt(sellingPriceMinor, "sellingPriceMinor");
  assertInt(sellingCostsMinor, "sellingCostsMinor");
  assertInt(perfumeCostMinor, "perfumeCostMinor");
  if (investorSharePercent < 0 || investorSharePercent > 100) {
    throw new Error("Investment finance: investorSharePercent must be 0–100");
  }
  const netProfitMinor = sellingPriceMinor - sellingCostsMinor - perfumeCostMinor;
  // Round investor share; business takes the remainder so the sum is exact.
  const investorProfitMinor = Math.round((netProfitMinor * investorSharePercent) / 100);
  const businessProfitMinor = netProfitMinor - investorProfitMinor;
  return {
    recoveredCapitalMinor: perfumeCostMinor,
    netProfitMinor,
    investorProfitMinor,
    businessProfitMinor,
  };
}

/** INVARIANT check. Returns null when healthy, else a description. */
export function validateInvariant(inv: {
  amountMinor: number;
  recoveredCapitalMinor: number;
  remainingInventoryCostMinor: number;
}): string | null {
  const { amountMinor, recoveredCapitalMinor, remainingInventoryCostMinor } = inv;
  if (recoveredCapitalMinor < 0) return "recoveredCapital is negative";
  if (remainingInventoryCostMinor < 0) return "remainingInventoryCost is negative";
  const sum = recoveredCapitalMinor + remainingInventoryCostMinor;
  if (sum !== amountMinor) {
    return `invariant violated: recovered (${recoveredCapitalMinor}) + remaining (${remainingInventoryCostMinor}) = ${sum} ≠ principal (${amountMinor})`;
  }
  return null;
}

/**
 * Plan a sale that may be only PARTIALLY funded by investor lots.
 * Consumes min(available, requested) ml FIFO — never throws on shortfall.
 * `mlFunded` may be 0 (no open lots) up to `mlRequested`. The caller
 * prorates revenue/costs by mlFunded / mlRequested; the unfunded remainder
 * stays with the existing store accounting.
 */
export function planPartialFifoSale(
  lots: SaleAllocationInput[],
  mlRequested: number
): { mlFunded: number; consumptions: SaleAllocationResult[] } {
  if (mlRequested <= 0) throw new Error("Investment finance: mlRequested must be > 0");
  const available = lots.reduce((s, l) => s + Math.max(0, l.remainingMl), 0);
  const mlFunded = Math.min(available, mlRequested);
  if (mlFunded <= 0) return { mlFunded: 0, consumptions: [] };
  return { mlFunded, consumptions: allocateSaleFifo(lots, mlFunded) };
}

/** Buyback amount = remaining capital + unwithdrawn profit. */
export function computeBuybackAmount(inv: {
  remainingInventoryCostMinor: number;
  availableProfitMinor: number;
}): number {
  assertInt(inv.remainingInventoryCostMinor, "remainingInventoryCostMinor");
  assertInt(inv.availableProfitMinor, "availableProfitMinor");
  return inv.remainingInventoryCostMinor + Math.max(0, inv.availableProfitMinor);
}
