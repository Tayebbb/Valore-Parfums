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

/**
 * FINAL ACCOUNTING DECISION (external financial review, 2026-08-18):
 * For an investor-funded sale the investor's profit share is CARVED OUT of
 * the item's net profit before the store owners are credited:
 *
 *     actual net profit = investor profit + Valore (owner) profit
 *
 * The owner P&L recognises `net profit − investor profit` — it must never
 * recognise the full net profit while the investor ledger simultaneously
 * recognises the investor share on top (double count). Non-funded sales pass
 * `investorProfitMinor = 0` and recognise the full net profit, unchanged.
 *
 * A NEGATIVE investor profit (loss on a funded sale) is clamped to 0 here:
 * the investor's loss share already lives in the investment ledger (reducing
 * withdrawable profit) and must never INCREASE what the owners recognise.
 * The result may still be ≤ 0 (item sold at/below cost) — callers skip
 * non-positive amounts, matching the pre-existing owner-crediting rule.
 *
 * `itemNetProfitMajor` is in MAJOR units (order items store BDT major);
 * `investorProfitMinor` is in minor units (investment ledger). The return
 * value is major units rounded to 2 dp, exact because minor = major × 100.
 */
export function ownerRecognizedItemProfitMajor(
  itemNetProfitMajor: number,
  investorProfitMinor: number
): number {
  assertInt(investorProfitMinor, "investorProfitMinor");
  const deductionMajor = Math.max(0, investorProfitMinor) / 100;
  return Math.round((itemNetProfitMajor - deductionMajor) * 100) / 100;
}

/**
 * Split an investor's capital-stream ledger history into capital recovered
 * through SALES versus capital returned through BUYBACK (investor statements
 * must distinguish the two). Sale reversals (negative capital adjustments)
 * net against sales recovery. Profit-stream entries are ignored.
 */
export function splitCapitalBySource(
  entries: Array<{ type: string; stream: string; amountMinor: number }>
): { fromSalesMinor: number; fromBuybackMinor: number } {
  let fromSalesMinor = 0;
  let fromBuybackMinor = 0;
  for (const e of entries) {
    if (e.stream !== "capital") continue;
    if (e.type === "buyback") fromBuybackMinor += e.amountMinor || 0;
    else fromSalesMinor += e.amountMinor || 0;
  }
  return { fromSalesMinor, fromBuybackMinor };
}
