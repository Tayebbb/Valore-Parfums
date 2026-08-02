/**
 * Read-only reconciliation of the Inventory Investment System.
 *
 * Run:  cd backend && npx tsx scripts/check-investments.ts
 *
 * Checks, per investment:
 *   1. INVARIANT: principal = recoveredCapital + remainingInventoryCost
 *   2. Lot capital: remainingInventoryCost = Σ open remainingMl × costPerMl
 *   3. Lot ml: fundedMl = remainingMl + soldMl for every allocation
 *   4. Ledger replay: balances derived from the immutable ledger match
 *      the stored investment balances.
 * And per investor: counters match the sum of their investments.
 *
 * NEVER writes. Exits non-zero when any check fails.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db, Collections } = await import("../src/lib/firebase-admin");

  let problems = 0;
  const report = (msg: string) => {
    problems++;
    console.error(`  ✗ ${msg}`);
  };

  const [invSnap, allocSnap, ledgerSnap, investorSnap] = await Promise.all([
    db.collection(Collections.investments).get(),
    db.collection(Collections.investmentAllocations).get(),
    db.collection(Collections.investmentTransactions).get(),
    db.collection(Collections.investors).get(),
  ]);

  console.log(
    `Loaded ${invSnap.size} investments, ${allocSnap.size} allocations, ${ledgerSnap.size} ledger entries, ${investorSnap.size} investors\n`
  );

  type AnyDoc = Record<string, number | string | undefined> & { id: string };
  const allocations: AnyDoc[] = allocSnap.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as AnyDoc));
  const ledger: AnyDoc[] = ledgerSnap.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as AnyDoc));

  for (const doc of invSnap.docs) {
    const inv = doc.data();
    const id = doc.id;
    console.log(`Investment ${id} (${inv.status})`);

    // 1. Invariant.
    const sum = (inv.recoveredCapitalMinor || 0) + (inv.remainingInventoryCostMinor || 0);
    if (sum !== inv.amountMinor) {
      report(`invariant: recovered + remaining = ${sum} ≠ principal ${inv.amountMinor}`);
    }

    const myAllocs = allocations.filter((a) => a.investmentId === id);

    // 2. Open-lot capital must equal remaining inventory cost (unless bought back/closed).
    if (inv.status === "active" || inv.status === "recovering") {
      const lotCapital = myAllocs
        .filter((a) => a.status === "open")
        .reduce((s, a) => s + Number(a.remainingMl || 0) * Number(a.costPerMlMinor || 0), 0);
      if (lotCapital !== (inv.remainingInventoryCostMinor || 0)) {
        report(`lot capital ${lotCapital} ≠ remainingInventoryCost ${inv.remainingInventoryCostMinor}`);
      }
    }

    // 3. Per-lot ml conservation.
    for (const a of myAllocs) {
      const funded = Number(a.fundedMl || 0);
      const rem = Number(a.remainingMl || 0);
      const sold = Number(a.soldMl || 0);
      if (funded !== rem + sold) {
        report(`allocation ${a.id}: fundedMl ${funded} ≠ remaining ${rem} + sold ${sold}`);
      }
      if (rem < 0 || sold < 0) report(`allocation ${a.id}: negative ml`);
    }

    // 4. Ledger replay.
    const myLedger = ledger.filter((e) => e.investmentId === id);
    const capitalFromLedger = myLedger
      .filter((e) => e.stream === "capital" && e.type !== "buyback")
      .reduce((s, e) => s + Number(e.amountMinor || 0), 0);
    const buybackCapital = myLedger
      .filter((e) => e.type === "buyback")
      .reduce(
        (s, e) => s + (Number(e.newBalanceMinor || 0) - Number(e.previousBalanceMinor || 0)),
        0
      );
    const profitFromLedger = myLedger
      .filter((e) => e.stream === "profit")
      .reduce((s, e) => s + Number(e.amountMinor || 0), 0);

    const expectedRecovered = capitalFromLedger + buybackCapital;
    if (expectedRecovered !== (inv.recoveredCapitalMinor || 0)) {
      report(
        `ledger replay: capital ${expectedRecovered} ≠ stored recovered ${inv.recoveredCapitalMinor}`
      );
    }
    // Profit stream must replay to the stored balance for EVERY status:
    // buyback now writes per-stream entries (payout / write-off), so a
    // bought_back investment replays to 0.
    const expectedProfit =
      inv.status === "bought_back" ? 0 : inv.availableProfitMinor || 0;
    if (profitFromLedger !== expectedProfit) {
      report(
        `ledger replay: profit ${profitFromLedger} ≠ expected ${expectedProfit} (stored availableProfit ${inv.availableProfitMinor})`
      );
    }
    if (problems === 0) console.log("  ✓ healthy");
  }

  // 5. Investor counters.
  for (const doc of investorSnap.docs) {
    const investor = doc.data();
    const myInvestments = invSnap.docs.filter((d) => d.data().investorId === doc.id);
    const invested = myInvestments.reduce((s, d) => s + (d.data().amountMinor || 0), 0);
    if (invested !== (investor.totalInvestedMinor || 0)) {
      report(
        `investor ${doc.id}: totalInvested ${investor.totalInvestedMinor} ≠ Σ investments ${invested}`
      );
    }
  }

  console.log("\n──────────────────────────────────");
  if (problems > 0) {
    console.error(`${problems} problem(s) found.`);
    process.exit(1);
  }
  console.log("All reconciliation checks passed.");
  process.exit(0);
}

main().catch((err) => {
  console.error("check-investments failed:", err);
  process.exit(1);
});
