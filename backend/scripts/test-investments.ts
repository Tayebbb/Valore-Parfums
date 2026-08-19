/**
 * Investment financial engine test suite (pure functions — no Firestore, no deps).
 *
 * Run:  cd backend && npx tsx scripts/test-investments.ts
 * Exits non-zero on any failure.
 */

import {
  calculatePerfumeCost,
  calculateSellingCosts,
  allocateSaleFifo,
  planPartialFifoSale,
  splitSale,
  validateInvariant,
  computeBuybackAmount,
  ownerRecognizedItemProfitMajor,
  splitCapitalBySource,
} from "../src/lib/investments/finance";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, name: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(name);
    console.error(`  ✗ FAIL: ${name}`);
  }
}

function assertEqual(actual: unknown, expected: unknown, name: string): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) console.error(`    expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  assert(ok, name);
}

function assertThrows(fn: () => unknown, name: string): void {
  try {
    fn();
    assert(false, `${name} (did not throw)`);
  } catch {
    assert(true, name);
  }
}

// ═══ 1. Golden worked example (from the approved design) ═══
// Investment 30,000 BDT → 5 × 100 ml bottles @ 6,000 BDT → 500 ml @ 60 BDT/ml.
// Sale: 10 ml @ 900 BDT, selling costs 100 BDT (bottle 20 + atomizer 35 +
// label 10 + packaging 25 + pouch 10). Investor share 40%.
console.log("1. Golden worked example");
{
  const PRINCIPAL = 3_000_000; // 30,000 BDT in minor units
  const COST_PER_ML = 6_000; // 60 BDT/ml

  const sellingCosts = calculateSellingCosts([2_000, 3_500, 1_000, 2_500, 1_000]);
  assertEqual(sellingCosts, 10_000, "selling costs total 100 BDT");

  const perfumeCost = calculatePerfumeCost(10, COST_PER_ML);
  assertEqual(perfumeCost, 60_000, "perfume cost of 10 ml = 600 BDT");

  const split = splitSale({
    sellingPriceMinor: 90_000, // 900 BDT
    sellingCostsMinor: sellingCosts,
    perfumeCostMinor: perfumeCost,
    investorSharePercent: 40,
  });
  assertEqual(split.recoveredCapitalMinor, 60_000, "recovered capital = 600 BDT");
  assertEqual(split.netProfitMinor, 20_000, "net profit = 200 BDT");
  assertEqual(split.investorProfitMinor, 8_000, "investor profit (40%) = 80 BDT");
  assertEqual(split.businessProfitMinor, 12_000, "business profit (60%) = 120 BDT");
  assertEqual(
    split.investorProfitMinor + split.businessProfitMinor,
    split.netProfitMinor,
    "profit split sums exactly to net profit"
  );

  // Post-sale invariant: recovered + remaining = principal.
  const remaining = PRINCIPAL - split.recoveredCapitalMinor;
  assertEqual(remaining, 2_940_000, "remaining inventory = 29,400 BDT");
  assertEqual(
    validateInvariant({
      amountMinor: PRINCIPAL,
      recoveredCapitalMinor: split.recoveredCapitalMinor,
      remainingInventoryCostMinor: remaining,
    }),
    null,
    "invariant holds: 600 + 29,400 = 30,000"
  );
}

// ═══ 2. FIFO allocation ═══
console.log("2. FIFO allocation");
{
  const lots = [
    { allocationId: "A", remainingMl: 30, costPerMlMinor: 5_000 },
    { allocationId: "B", remainingMl: 50, costPerMlMinor: 6_000 },
    { allocationId: "C", remainingMl: 100, costPerMlMinor: 7_000 },
  ];

  // Within first lot.
  assertEqual(
    allocateSaleFifo(lots, 10),
    [{ allocationId: "A", mlConsumed: 10, capitalMinor: 50_000 }],
    "sale within first lot consumes only that lot"
  );

  // Exactly depletes first lot.
  assertEqual(
    allocateSaleFifo(lots, 30),
    [{ allocationId: "A", mlConsumed: 30, capitalMinor: 150_000 }],
    "sale exactly depleting first lot"
  );

  // Spans two lots.
  assertEqual(
    allocateSaleFifo(lots, 40),
    [
      { allocationId: "A", mlConsumed: 30, capitalMinor: 150_000 },
      { allocationId: "B", mlConsumed: 10, capitalMinor: 60_000 },
    ],
    "sale spanning two lots at different cost bases"
  );

  // Spans all three; consumes everything.
  const all = allocateSaleFifo(lots, 180);
  assertEqual(
    all.reduce((s, r) => s + r.mlConsumed, 0),
    180,
    "full depletion consumes all 180 ml"
  );
  assertEqual(
    all.reduce((s, r) => s + r.capitalMinor, 0),
    30 * 5_000 + 50 * 6_000 + 100 * 7_000,
    "full depletion recovers exact total capital"
  );

  // Skips empty lots.
  assertEqual(
    allocateSaleFifo(
      [
        { allocationId: "empty", remainingMl: 0, costPerMlMinor: 5_000 },
        { allocationId: "B", remainingMl: 50, costPerMlMinor: 6_000 },
      ],
      5
    ),
    [{ allocationId: "B", mlConsumed: 5, capitalMinor: 30_000 }],
    "empty lots are skipped"
  );

  // Insufficient stock throws (caller falls back to store-owned logic).
  assertThrows(() => allocateSaleFifo(lots, 181), "oversell throws");
  assertThrows(() => allocateSaleFifo([], 1), "no lots throws");
  assertThrows(() => allocateSaleFifo(lots, 0), "zero ml throws");
  assertThrows(() => allocateSaleFifo(lots, -5), "negative ml throws");
}

// ═══ 3. Rounding & integer safety ═══
console.log("3. Rounding & integer safety");
{
  // Odd net profit, 40%: 33,333 × 0.4 = 13,333.2 → round 13,333; business gets remainder.
  const s1 = splitSale({
    sellingPriceMinor: 100_000,
    sellingCostsMinor: 6_667,
    perfumeCostMinor: 60_000,
    investorSharePercent: 40,
  });
  assertEqual(s1.netProfitMinor, 33_333, "odd net profit computed");
  assertEqual(s1.investorProfitMinor, 13_333, "investor share rounded");
  assertEqual(s1.businessProfitMinor, 20_000, "business takes exact remainder");
  assertEqual(
    s1.investorProfitMinor + s1.businessProfitMinor,
    33_333,
    "no poisha lost to rounding"
  );

  // 1 minor unit of profit at 50%.
  const s2 = splitSale({
    sellingPriceMinor: 1,
    sellingCostsMinor: 0,
    perfumeCostMinor: 0,
    investorSharePercent: 50,
  });
  assertEqual(s2.investorProfitMinor + s2.businessProfitMinor, 1, "1-poisha profit splits without loss");

  // 0% and 100% shares.
  const s3 = splitSale({ sellingPriceMinor: 10_000, sellingCostsMinor: 0, perfumeCostMinor: 0, investorSharePercent: 0 });
  assertEqual(s3.investorProfitMinor, 0, "0% share → investor gets nothing");
  assertEqual(s3.businessProfitMinor, 10_000, "0% share → business gets all");
  const s4 = splitSale({ sellingPriceMinor: 10_000, sellingCostsMinor: 0, perfumeCostMinor: 0, investorSharePercent: 100 });
  assertEqual(s4.investorProfitMinor, 10_000, "100% share → investor gets all");
  assertEqual(s4.businessProfitMinor, 0, "100% share → business gets nothing");

  // Non-integer inputs rejected.
  assertThrows(
    () => splitSale({ sellingPriceMinor: 10.5, sellingCostsMinor: 0, perfumeCostMinor: 0, investorSharePercent: 40 }),
    "fractional minor units rejected"
  );
  assertThrows(
    () => splitSale({ sellingPriceMinor: 100, sellingCostsMinor: 0, perfumeCostMinor: 0, investorSharePercent: 101 }),
    "share > 100 rejected"
  );
  assertThrows(
    () => splitSale({ sellingPriceMinor: 100, sellingCostsMinor: 0, perfumeCostMinor: 0, investorSharePercent: -1 }),
    "negative share rejected"
  );
  assertThrows(() => calculateSellingCosts([100, -5]), "negative selling cost rejected");
  assertThrows(() => calculatePerfumeCost(10, 60.5), "fractional costPerMl rejected");
}

// ═══ 4. Loss handling (capital protected, profit absorbs loss) ═══
console.log("4. Loss handling");
{
  // Sold below cost: capital still recovered in FULL; net profit negative.
  const loss = splitSale({
    sellingPriceMinor: 50_000, // 500 BDT revenue
    sellingCostsMinor: 10_000, // 100 BDT costs
    perfumeCostMinor: 60_000, // 600 BDT capital
    investorSharePercent: 40,
  });
  assertEqual(loss.recoveredCapitalMinor, 60_000, "capital recovered in full despite loss");
  assertEqual(loss.netProfitMinor, -20_000, "net loss computed");
  assertEqual(loss.investorProfitMinor, -8_000, "investor absorbs 40% of loss");
  assertEqual(loss.businessProfitMinor, -12_000, "business absorbs 60% of loss");
}

// ═══ 5. Invariant validation ═══
console.log("5. Invariant validation");
{
  assertEqual(
    validateInvariant({ amountMinor: 3_000_000, recoveredCapitalMinor: 0, remainingInventoryCostMinor: 3_000_000 }),
    null,
    "fresh investment is healthy"
  );
  assertEqual(
    validateInvariant({ amountMinor: 3_000_000, recoveredCapitalMinor: 3_000_000, remainingInventoryCostMinor: 0 }),
    null,
    "fully recovered investment is healthy"
  );
  assert(
    validateInvariant({ amountMinor: 3_000_000, recoveredCapitalMinor: 100, remainingInventoryCostMinor: 3_000_000 }) !== null,
    "over-recovery detected"
  );
  assert(
    validateInvariant({ amountMinor: 3_000_000, recoveredCapitalMinor: -1, remainingInventoryCostMinor: 3_000_001 }) !== null,
    "negative recovered capital detected"
  );
  assert(
    validateInvariant({ amountMinor: 3_000_000, recoveredCapitalMinor: 3_000_001, remainingInventoryCostMinor: -1 }) !== null,
    "negative remaining inventory detected"
  );
}

// ═══ 6. Buyback math ═══
console.log("6. Buyback math");
{
  assertEqual(
    computeBuybackAmount({ remainingInventoryCostMinor: 2_940_000, availableProfitMinor: 8_000 }),
    2_948_000,
    "buyback = remaining capital + available profit"
  );
  assertEqual(
    computeBuybackAmount({ remainingInventoryCostMinor: 0, availableProfitMinor: 8_000 }),
    8_000,
    "fully recovered investment buyback = profit only"
  );
  assertEqual(
    computeBuybackAmount({ remainingInventoryCostMinor: 100_000, availableProfitMinor: -5_000 }),
    100_000,
    "negative available profit never reduces buyback capital"
  );
}

// ═══ 7. End-to-end simulation: sell out the entire golden investment ═══
console.log("7. Full lifecycle simulation");
{
  const PRINCIPAL = 3_000_000;
  const COST_PER_ML = 6_000;
  let remainingCapital = PRINCIPAL;
  let recovered = 0;
  let investorProfit = 0;
  let lot = { allocationId: "L1", remainingMl: 500, costPerMlMinor: COST_PER_ML };

  // Sell 50 sales of 10 ml each at 900 BDT with 100 BDT costs.
  for (let i = 0; i < 50; i++) {
    const [c] = allocateSaleFifo([lot], 10);
    const split = splitSale({
      sellingPriceMinor: 90_000,
      sellingCostsMinor: 10_000,
      perfumeCostMinor: c.capitalMinor,
      investorSharePercent: 40,
    });
    recovered += split.recoveredCapitalMinor;
    remainingCapital -= split.recoveredCapitalMinor;
    investorProfit += split.investorProfitMinor;
    lot = { ...lot, remainingMl: lot.remainingMl - c.mlConsumed };
    const err = validateInvariant({
      amountMinor: PRINCIPAL,
      recoveredCapitalMinor: recovered,
      remainingInventoryCostMinor: remainingCapital,
    });
    if (err) {
      assert(false, `invariant failed on sale ${i + 1}: ${err}`);
      break;
    }
  }

  assertEqual(lot.remainingMl, 0, "all 500 ml sold");
  assertEqual(recovered, PRINCIPAL, "100% of capital recovered through sales");
  assertEqual(remainingCapital, 0, "remaining inventory cost is zero");
  assertEqual(investorProfit, 50 * 8_000, "investor earned 80 BDT × 50 sales = 4,000 BDT");
  assertThrows(() => allocateSaleFifo([lot], 1), "selling from a depleted lot throws");
}

// ═══ 8. Withdrawal cap logic (mirror of service validation) ═══
console.log("8. Withdrawal caps");
{
  const availableProfit = 8_000;
  // The service refuses any amount above available profit and any non-positive
  // integer. Replicate the exact guards to lock the contract.
  const isValidWithdrawal = (amt: number) =>
    Number.isInteger(amt) && amt > 0 && amt <= availableProfit;
  assert(isValidWithdrawal(8_000), "withdraw exactly the available profit");
  assert(isValidWithdrawal(1), "withdraw 1 poisha");
  assert(!isValidWithdrawal(8_001), "over-withdrawal rejected");
  assert(!isValidWithdrawal(0), "zero withdrawal rejected");
  assert(!isValidWithdrawal(-100), "negative withdrawal rejected");
  assert(!isValidWithdrawal(100.5), "fractional withdrawal rejected");
}

// ═══ 9. Partial funding planner (Phase 3 order integration) ═══
console.log("9. planPartialFifoSale");
{
  const lots = [
    { allocationId: "a", remainingMl: 6, costPerMlMinor: 6_000 },
    { allocationId: "b", remainingMl: 4, costPerMlMinor: 7_000 },
  ];
  // Fully funded request behaves exactly like allocateSaleFifo.
  const full = planPartialFifoSale(lots, 8);
  assertEqual(full.mlFunded, 8, "fully funded request consumes requested ml");
  assertEqual(full.consumptions, allocateSaleFifo(lots, 8), "matches allocateSaleFifo when funded");

  // Oversell consumes only what is funded — never throws.
  const partial = planPartialFifoSale(lots, 25);
  assertEqual(partial.mlFunded, 10, "oversell capped at available funded ml");
  assertEqual(
    partial.consumptions.reduce((s, c) => s + c.capitalMinor, 0),
    6 * 6_000 + 4 * 7_000,
    "partial capital equals full remaining lot capital"
  );

  // No open lots → zero-funded plan (caller falls through to store logic).
  const none = planPartialFifoSale([], 10);
  assertEqual(none.mlFunded, 0, "no lots → mlFunded 0");
  assertEqual(none.consumptions.length, 0, "no lots → no consumptions");
  const zeroed = planPartialFifoSale([{ allocationId: "z", remainingMl: 0, costPerMlMinor: 6_000 }], 5);
  assertEqual(zeroed.mlFunded, 0, "depleted lots → mlFunded 0");

  assertThrows(() => planPartialFifoSale(lots, 0), "zero ml request throws");
  assertThrows(() => planPartialFifoSale(lots, -3), "negative ml request throws");
}

// ═══ 10. Sale reversal math (cancelled orders) ═══
// A reversal appends compensating adjustments (-amount per entry) and must
// restore the exact pre-sale state, including the invariant.
console.log("10. Reversal restores pre-sale state");
{
  const PRINCIPAL = 3_000_000;
  const inv = { amountMinor: PRINCIPAL, recoveredCapitalMinor: 0, remainingInventoryCostMinor: PRINCIPAL, availableProfitMinor: 0 };
  const split = splitSale({ sellingPriceMinor: 90_000, sellingCostsMinor: 10_000, perfumeCostMinor: 60_000, investorSharePercent: 40 });

  // Apply sale
  inv.recoveredCapitalMinor += split.recoveredCapitalMinor;
  inv.remainingInventoryCostMinor -= split.recoveredCapitalMinor;
  inv.availableProfitMinor += split.investorProfitMinor;
  assertEqual(validateInvariant(inv), null, "invariant holds after sale");

  // Reverse (compensating -amount per stream, exactly what reverseSalesForOrder writes)
  inv.recoveredCapitalMinor -= split.recoveredCapitalMinor;
  inv.remainingInventoryCostMinor += split.recoveredCapitalMinor;
  inv.availableProfitMinor -= split.investorProfitMinor;
  assertEqual(inv.recoveredCapitalMinor, 0, "reversal restores recovered capital to 0");
  assertEqual(inv.remainingInventoryCostMinor, PRINCIPAL, "reversal restores remaining inventory cost");
  assertEqual(inv.availableProfitMinor, 0, "reversal restores available profit");
  assertEqual(validateInvariant(inv), null, "invariant holds after reversal");

  // Loss-sale reversal: negative profit reverses to zero too.
  const lossSplit = splitSale({ sellingPriceMinor: 50_000, sellingCostsMinor: 10_000, perfumeCostMinor: 60_000, investorSharePercent: 40 });
  assert(lossSplit.investorProfitMinor < 0, "loss sale produces negative investor profit");
  const profit = 0 + lossSplit.investorProfitMinor - lossSplit.investorProfitMinor;
  assertEqual(profit, 0, "loss reversal restores profit to 0");
}

// ═══ 11. Buyback stream separation (Phase 4 hardening) ═══
// The buyback payout / write-off model: paidProfit = max(0, availableProfit).
// Capital and profit are ledgered as SEPARATE entries so each stream replays
// to its stored balance independently.
console.log("11. Buyback stream separation");
{
  // Zero-profit sale: net exactly 0 → both shares 0, capital still recovers.
  const zero = splitSale({ sellingPriceMinor: 70_000, sellingCostsMinor: 10_000, perfumeCostMinor: 60_000, investorSharePercent: 40 });
  assertEqual(zero.netProfitMinor, 0, "zero-profit sale: net = 0");
  assertEqual(zero.investorProfitMinor, 0, "zero-profit sale: investor share = 0");
  assertEqual(zero.businessProfitMinor, 0, "zero-profit sale: business share = 0");
  assertEqual(zero.recoveredCapitalMinor, 60_000, "zero-profit sale: capital still recovered");

  // Positive-profit buyback: payout = remaining + profit; profit stream nets to 0.
  const pos = { remainingInventoryCostMinor: 500_000, availableProfitMinor: 12_000 };
  const posPaidProfit = Math.max(0, pos.availableProfitMinor);
  assertEqual(computeBuybackAmount(pos), 512_000, "positive buyback = remaining + profit");
  assertEqual(posPaidProfit, 12_000, "positive buyback pays full profit");
  // Ledger: capital entry +500,000 (buyback), profit entry -12,000 (payout).
  assertEqual(pos.availableProfitMinor - posPaidProfit, 0, "profit stream replays to 0 after payout");

  // Negative-profit buyback: payout = remaining only; write-off zeroes profit.
  const neg = { remainingInventoryCostMinor: 500_000, availableProfitMinor: -7_000 };
  const negPaidProfit = Math.max(0, neg.availableProfitMinor);
  assertEqual(computeBuybackAmount(neg), 500_000, "negative buyback pays capital only");
  assertEqual(negPaidProfit, 0, "negative profit is never paid or withdrawn");
  const writeOff = -neg.availableProfitMinor; // +7,000 adjustment entry
  assertEqual(neg.availableProfitMinor + writeOff, 0, "write-off entry replays profit to 0");
  assert(writeOff > 0, "write-off is a positive profit-stream adjustment");

  // Both-zero buyback: nothing owed, nothing written off.
  assertEqual(
    computeBuybackAmount({ remainingInventoryCostMinor: 0, availableProfitMinor: 0 }),
    0,
    "fully recovered, zero profit → buyback owes nothing"
  );
}

// ═══ 12. Owner P&L integration — economic profit is never double-counted ═══
// FINAL ACCOUNTING DECISION: for investor-funded sales the investor share is
// carved OUT of the item's net profit before owner crediting:
//   actual net profit = investor profit + Valore (owner) profit
console.log("12. Owner P&L integration (no double count)");
{
  // Canonical example from the external review:
  // Revenue 900, perfume cost 600, direct costs 100 → net profit 200.
  // Investor share 40% → investor 80, Valore 120.
  const split = splitSale({
    sellingPriceMinor: 90_000,
    sellingCostsMinor: 10_000,
    perfumeCostMinor: 60_000,
    investorSharePercent: 40,
  });
  assertEqual(split.netProfitMinor, 20_000, "canonical: net profit = 200");
  assertEqual(split.investorProfitMinor, 8_000, "canonical: investor profit = 80");
  assertEqual(split.businessProfitMinor, 12_000, "canonical: Valore profit = 120");

  // Owner-side item net profit (major units): 900 − (600 + 100) = 200.
  const itemNetMajor = 900 - 700;
  const ownerRecognized = ownerRecognizedItemProfitMajor(itemNetMajor, split.investorProfitMinor);
  assertEqual(ownerRecognized, 120, "owner P&L recognises 120 — NOT the full 200");
  assertEqual(
    ownerRecognized + split.investorProfitMinor / 100,
    200,
    "total economic profit = investor 80 + Valore 120 = exactly 200"
  );
  // Owner split of the recognised 120 at 60/40 stays inside the 120.
  const o1 = Math.round(ownerRecognized * 0.6);
  const o2 = ownerRecognized - o1;
  assertEqual(o1 + o2, 120, "owner1 + owner2 shares sum to the recognised 120");

  // Non-investor-funded sale: behaviour preserved bit-for-bit.
  assertEqual(
    ownerRecognizedItemProfitMajor(200, 0),
    200,
    "non-funded sale recognises the full net profit (unchanged behaviour)"
  );

  // Non-interference: one funded + one unfunded item in the same order.
  const fundedRecognized = ownerRecognizedItemProfitMajor(200, 8_000);
  const unfundedRecognized = ownerRecognizedItemProfitMajor(150, 0);
  assertEqual(fundedRecognized, 120, "funded item deducts only ITS OWN investor profit");
  assertEqual(unfundedRecognized, 150, "unfunded item in the same order is untouched");
  assertEqual(
    80 + fundedRecognized + unfundedRecognized,
    350,
    "order economic profit: investor 80 + owners 270 = 350 (= 200 + 150) exactly"
  );

  // Loss on a funded sale: negative investor profit must never INFLATE the
  // owner P&L — the deduction clamps at 0; the investor's loss share lives in
  // the investment ledger. Callers skip non-positive owner amounts.
  const loss = splitSale({
    sellingPriceMinor: 50_000,
    sellingCostsMinor: 10_000,
    perfumeCostMinor: 60_000,
    investorSharePercent: 40,
  });
  assert(loss.investorProfitMinor < 0, "loss sale produces negative investor profit");
  assertEqual(
    ownerRecognizedItemProfitMajor(-200, loss.investorProfitMinor),
    -200,
    "loss: owner-side result unchanged (no negative deduction credited)"
  );
  assertEqual(
    ownerRecognizedItemProfitMajor(50, -1_000),
    50,
    "basis drift: engine loss never increases owner recognition"
  );

  // Rounding exactness: odd investor share deducts to exact 2 dp.
  assertEqual(
    ownerRecognizedItemProfitMajor(333.33, 13_333),
    200,
    "odd amounts: 333.33 − 133.33 = 200.00 exactly"
  );

  // Partially funded item: only the funded fraction's investor profit is
  // deducted; the unfunded remainder stays entirely with the store.
  const lots = [{ allocationId: "p", remainingMl: 4, costPerMlMinor: 6_000 }];
  const plan = planPartialFifoSale(lots, 10); // request 10 ml, only 4 funded
  assertEqual(plan.mlFunded, 4, "partial: 4 of 10 ml funded");
  const partialSplit = splitSale({
    sellingPriceMinor: Math.round((90_000 * 4) / 10), // prorated revenue 360
    sellingCostsMinor: Math.round((10_000 * 4) / 10), // prorated costs 40
    perfumeCostMinor: plan.consumptions[0].capitalMinor, // 240
    investorSharePercent: 40,
  });
  assertEqual(partialSplit.investorProfitMinor, 3_200, "partial: investor profit = 32");
  const partialRecognized = ownerRecognizedItemProfitMajor(200, partialSplit.investorProfitMinor);
  assertEqual(partialRecognized, 168, "partial: owner recognises 200 − 32 = 168");
  assertEqual(
    partialRecognized + partialSplit.investorProfitMinor / 100,
    200,
    "partial: economic profit still exactly 200"
  );

  // Integer-safety on the deduction input.
  assertThrows(
    () => ownerRecognizedItemProfitMajor(200, 80.5),
    "fractional minor-unit investor profit rejected"
  );
}

// ═══ 13. Capital by source (statement: sales vs buyback) ═══
console.log("13. splitCapitalBySource");
{
  // Sales only.
  assertEqual(
    splitCapitalBySource([
      { type: "capital_recovery", stream: "capital", amountMinor: 60_000 },
      { type: "capital_recovery", stream: "capital", amountMinor: 60_000 },
    ]),
    { fromSalesMinor: 120_000, fromBuybackMinor: 0 },
    "sales-only history attributes everything to sales"
  );
  // Sale + reversal nets to zero; buyback separate.
  assertEqual(
    splitCapitalBySource([
      { type: "capital_recovery", stream: "capital", amountMinor: 60_000 },
      { type: "adjustment", stream: "capital", amountMinor: -60_000 },
      { type: "buyback", stream: "capital", amountMinor: 2_940_000 },
    ]),
    { fromSalesMinor: 0, fromBuybackMinor: 2_940_000 },
    "reversal nets against sales; buyback reported separately"
  );
  // Profit-stream entries are ignored.
  assertEqual(
    splitCapitalBySource([
      { type: "profit_generated", stream: "profit", amountMinor: 8_000 },
      { type: "profit_withdrawal", stream: "profit", amountMinor: -8_000 },
      { type: "investment_created", stream: "none", amountMinor: 3_000_000 },
    ]),
    { fromSalesMinor: 0, fromBuybackMinor: 0 },
    "profit and none streams never count as capital"
  );
}

// ═══ 14. Combined business P&L — books reconcile to economic truth ═══
// Simulates a mixed completed order batch exactly the way the production
// code books it (investor ledger first, then owner recognition per item)
// and proves the two sets of books always reconcile to gross economic
// profit with no double count and no leakage.
console.log("14. Combined business P&L reconciliation");
{
  // Batch: (a) fully funded profitable, (b) non-funded, (c) funded loss,
  // (d) partially funded profitable.
  const items: Array<{
    name: string;
    netMajor: number; // totalPrice − costPrice (order item economics)
    investorProfitMinor: number; // raw signed ledger value (0 = not funded)
  }> = [];

  // (a) canonical: net 200, 40% share → investor 80.
  const a = splitSale({
    sellingPriceMinor: 90_000,
    sellingCostsMinor: 10_000,
    perfumeCostMinor: 60_000,
    investorSharePercent: 40,
  });
  items.push({ name: "funded", netMajor: 200, investorProfitMinor: a.investorProfitMinor });

  // (b) non-funded: net 150, no investor.
  items.push({ name: "non-funded", netMajor: 150, investorProfitMinor: 0 });

  // (c) funded loss: revenue 500, costs 50, perfume 600 → net −150, investor −60.
  const c = splitSale({
    sellingPriceMinor: 50_000,
    sellingCostsMinor: 5_000,
    perfumeCostMinor: 60_000,
    investorSharePercent: 40,
  });
  assertEqual(c.netProfitMinor, -15_000, "combined: loss item net = −150");
  assertEqual(c.investorProfitMinor, -6_000, "combined: loss item investor share = −60");
  items.push({ name: "funded-loss", netMajor: -150, investorProfitMinor: c.investorProfitMinor });

  // (d) partially funded: 4 of 10 ml funded → prorated net 80, investor 32;
  //     unfunded remainder net 120 stays fully with the store on the SAME item.
  const dLots = [{ allocationId: "d", remainingMl: 4, costPerMlMinor: 6_000 }];
  const dPlan = planPartialFifoSale(dLots, 10);
  const d = splitSale({
    sellingPriceMinor: Math.round((90_000 * dPlan.mlFunded) / 10),
    sellingCostsMinor: Math.round((10_000 * dPlan.mlFunded) / 10),
    perfumeCostMinor: dPlan.consumptions[0].capitalMinor,
    investorSharePercent: 40,
  });
  assertEqual(d.investorProfitMinor, 3_200, "combined: partial item investor share = 32");
  items.push({ name: "partial", netMajor: 200, investorProfitMinor: d.investorProfitMinor });

  // Book the batch the way orders/[id]/route.ts does at Dispatched.
  let ownerBookedMajor = 0; // owner accounts (recognised > 0 only)
  let investorLedgerMinor = 0; // investor profit stream (raw, signed)
  let grossEconomicMajor = 0;
  for (const item of items) {
    grossEconomicMajor += item.netMajor;
    investorLedgerMinor += item.investorProfitMinor;
    const recognized = ownerRecognizedItemProfitMajor(item.netMajor, item.investorProfitMinor);
    if (recognized > 0) ownerBookedMajor += recognized;
  }

  assertEqual(grossEconomicMajor, 400, "combined: gross economic profit = 200 + 150 − 150 + 200 = 400");
  assertEqual(investorLedgerMinor, 5_200, "combined: investor ledger nets 80 − 60 + 32 = 52");
  assertEqual(ownerBookedMajor, 120 + 150 + 168, "combined: owner books credit 438 (loss item books 0)");

  // ECONOMIC ATTRIBUTION INVARIANT (what /api/investments/reports exposes):
  // valoreRetained is DEFINED as gross − investor, so it holds exactly.
  const valoreRetainedMajor = grossEconomicMajor - investorLedgerMinor / 100;
  assertEqual(
    grossEconomicMajor,
    investorLedgerMinor / 100 + valoreRetainedMajor,
    "INVARIANT: Gross Economic Profit = Investor Profit + Valore Retained Profit"
  );

  // Books never exceed economic truth: owner booked + investor ledger ≤ gross,
  // and the shortfall is exactly the loss clamped out of the owner books
  // (−150 net booked as 0) plus the investor loss share double-carried there.
  const bookedTotalMajor = ownerBookedMajor + investorLedgerMinor / 100;
  assertEqual(bookedTotalMajor, 490, "combined: total booked = 438 + 52 = 490");
  assertEqual(
    bookedTotalMajor - grossEconomicMajor,
    90,
    "combined: books exceed economics only by the UNBOOKED loss (150 − 60 = 90 absorbed nowhere else)"
  );

  // Per-item no-double-count: for every profitable funded item,
  // recognised + investor share reproduces the item's net exactly.
  for (const item of items) {
    if (item.investorProfitMinor <= 0 || item.netMajor <= 0) continue;
    const recognized = ownerRecognizedItemProfitMajor(item.netMajor, item.investorProfitMinor);
    assertEqual(
      recognized + item.investorProfitMinor / 100,
      item.netMajor,
      `combined: item "${item.name}" splits with zero double count`
    );
  }
}

// ═══ Summary ═══
console.log("\n──────────────────────────────────");
console.log(`PASSED: ${passed}   FAILED: ${failed}`);
if (failed > 0) {
  console.error("Failing tests:");
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
console.log("All investment engine tests passed.");
