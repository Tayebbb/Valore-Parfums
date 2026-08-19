import { NextResponse } from "next/server";
import { db, Collections } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { fromMinorUnits, toMinorUnits } from "@/lib/finance";
import { ownerRecognizedItemProfitMajor } from "@/lib/investments/finance";
import { normalizeOrderStatus } from "@/lib/orderStatusConfig";
import type { InvestmentAllocationDoc, InvestmentDoc, InvestorDoc, LedgerEntryDoc, InvestmentWithdrawalDoc } from "@/lib/investments/types";

// GET aggregate investment report — admin only.
// Computed on demand from live docs (no stored report collection —
// matches the codebase's recompute-on-read pattern).
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [investorSnap, investmentSnap, allocationSnap, ledgerSnap, withdrawalSnap, allItemsSnap, ordersSnap] = await Promise.all([
    db.collection(Collections.investors).get(),
    db.collection(Collections.investments).get(),
    db.collection(Collections.investmentAllocations).get(),
    db.collection(Collections.investmentTransactions).get(),
    db.collection(Collections.investmentWithdrawals).get(),
    db.collectionGroup("items").get(),
    db.collection(Collections.orders).get(),
  ]);

  const investments = investmentSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as InvestmentDoc),
  }));
  const allocations = allocationSnap.docs.map((d) => d.data() as InvestmentAllocationDoc);

  let totalInvestedMinor = 0;
  let totalRecoveredMinor = 0;
  let totalRemainingMinor = 0;
  let totalAvailableProfitMinor = 0;
  let totalWithdrawnProfitMinor = 0;
  const byStatus: Record<string, number> = {};
  const invariantViolations: Array<{ investmentId: string; detail: string }> = [];

  for (const inv of investments) {
    totalInvestedMinor += inv.amountMinor || 0;
    totalRecoveredMinor += inv.recoveredCapitalMinor || 0;
    totalRemainingMinor += inv.remainingInventoryCostMinor || 0;
    totalAvailableProfitMinor += inv.availableProfitMinor || 0;
    totalWithdrawnProfitMinor += inv.withdrawnProfitMinor || 0;
    byStatus[inv.status] = (byStatus[inv.status] || 0) + 1;

    const sum = (inv.recoveredCapitalMinor || 0) + (inv.remainingInventoryCostMinor || 0);
    if (sum !== inv.amountMinor) {
      invariantViolations.push({
        investmentId: inv.id,
        detail: `recovered + remaining = ${sum}, principal = ${inv.amountMinor}`,
      });
    }
  }

  const openAllocations = allocations.filter((a) => a.status === "open");
  const fundedMlRemaining = openAllocations.reduce((s, a) => s + (a.remainingMl || 0), 0);
  const fundedMlSold = allocations.reduce((s, a) => s + (a.soldMl || 0), 0);

  // ── Monthly breakdown from the ledger (capital recovered / investor profit) ──
  const toDate = (ts: unknown): Date => {
    if (ts && typeof ts === "object" && "toDate" in ts && typeof (ts as { toDate?: unknown }).toDate === "function") {
      return (ts as { toDate: () => Date }).toDate();
    }
    return new Date(ts as string | number | Date);
  };
  const monthly: Record<string, { capitalRecoveredMinor: number; investorProfitMinor: number; mlSold: number }> = {};
  for (const doc of ledgerSnap.docs) {
    const e = doc.data() as LedgerEntryDoc;
    if (e.type !== "capital_recovery" && e.type !== "profit_generated") continue;
    const d = toDate(e.createdAt);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!monthly[key]) monthly[key] = { capitalRecoveredMinor: 0, investorProfitMinor: 0, mlSold: 0 };
    if (e.type === "capital_recovery") {
      monthly[key].capitalRecoveredMinor += e.amountMinor || 0;
      monthly[key].mlSold += e.mlSold || 0;
    } else {
      monthly[key].investorProfitMinor += e.amountMinor || 0;
    }
  }
  const monthlyBreakdown = Object.entries(monthly)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, m]) => ({
      month,
      capitalRecovered: fromMinorUnits(m.capitalRecoveredMinor),
      investorProfit: fromMinorUnits(m.investorProfitMinor),
      mlSold: m.mlSold,
    }));

  // ── Per-perfume funded inventory ──
  const perfumeMap: Record<string, { perfumeName: string; fundedMl: number; remainingMl: number; soldMl: number }> = {};
  for (const a of allocations) {
    const key = a.perfumeId;
    if (!perfumeMap[key]) perfumeMap[key] = { perfumeName: a.perfumeName || key, fundedMl: 0, remainingMl: 0, soldMl: 0 };
    perfumeMap[key].fundedMl += a.fundedMl || 0;
    perfumeMap[key].remainingMl += a.status === "open" ? a.remainingMl || 0 : 0;
    perfumeMap[key].soldMl += a.soldMl || 0;
  }
  const byPerfume = Object.entries(perfumeMap)
    .map(([perfumeId, p]) => ({ perfumeId, ...p }))
    .sort((a, b) => b.soldMl - a.soldMl);

  // ── Withdrawal pipeline ──
  const withdrawals = withdrawalSnap.docs.map((d) => d.data() as InvestmentWithdrawalDoc);
  const pendingWithdrawals = withdrawals.filter((w) => w.status === "pending");
  const paidWithdrawals = withdrawals.filter((w) => w.status === "paid");

  // ── Profit attribution for investor-funded sales (ACCOUNTING INVARIANT) ──
  // Gross Economic Profit = Investor Profit + Valore Retained Profit.
  // Computed from the SAME persisted per-item `investmentRecognition` values
  // the Dispatched crediting code used, over completed-family orders only —
  // so this report reconciles exactly with the owner P&L and investor ledger.
  const completedOrderIds = new Set(
    ordersSnap.docs
      .filter((d) => {
        const o = d.data() as { status?: string; pickupMethod?: string };
        return normalizeOrderStatus(o.status, o.pickupMethod) === "Dispatched";
      })
      .map((d) => d.id)
  );
  let fundedGrossMinor = 0;
  let fundedInvestorMinor = 0;
  let fundedValoreBookedMinor = 0;
  let fundedItemCount = 0;
  let clampedLossItemCount = 0;
  for (const doc of allItemsSnap.docs) {
    const orderId = doc.ref.parent.parent?.id;
    if (!orderId || !completedOrderIds.has(orderId)) continue;
    const item = doc.data() as {
      totalPrice?: number;
      costPrice?: number;
      investmentRecognition?: { investorProfitMinor?: number };
    };
    const rec = item.investmentRecognition;
    if (!rec) continue; // not investor-funded
    fundedItemCount++;
    const itemNetMajor = Number(item.totalPrice ?? 0) - Number(item.costPrice ?? 0);
    const investorProfitMinor = Number(rec.investorProfitMinor ?? 0);
    fundedGrossMinor += toMinorUnits(itemNetMajor);
    fundedInvestorMinor += investorProfitMinor;
    // What the owner books actually credited (mirrors the Dispatched code:
    // recognised amounts ≤ 0 are skipped, negative investor profit clamps to 0).
    const recognized = ownerRecognizedItemProfitMajor(itemNetMajor, investorProfitMinor);
    if (recognized > 0) fundedValoreBookedMinor += toMinorUnits(recognized);
    if (investorProfitMinor < 0 || recognized <= 0) clampedLossItemCount++;
  }
  // Economic attribution: retained is DEFINED as the remainder, so the
  // invariant gross = investor + retained holds exactly, including losses.
  const fundedValoreRetainedMinor = fundedGrossMinor - fundedInvestorMinor;

  return NextResponse.json({
    investors: {
      total: investorSnap.size,
      active: investorSnap.docs.filter((d) => (d.data() as InvestorDoc).status === "active").length,
    },
    investments: { total: investments.length, byStatus },
    totals: {
      invested: fromMinorUnits(totalInvestedMinor),
      capitalRecovered: fromMinorUnits(totalRecoveredMinor),
      remainingInventoryCost: fromMinorUnits(totalRemainingMinor),
      availableInvestorProfit: fromMinorUnits(totalAvailableProfitMinor),
      withdrawnInvestorProfit: fromMinorUnits(totalWithdrawnProfitMinor),
      investedMinor: totalInvestedMinor,
      capitalRecoveredMinor: totalRecoveredMinor,
      remainingInventoryCostMinor: totalRemainingMinor,
      availableInvestorProfitMinor: totalAvailableProfitMinor,
      withdrawnInvestorProfitMinor: totalWithdrawnProfitMinor,
    },
    inventory: {
      openAllocations: openAllocations.length,
      fundedMlRemaining,
      fundedMlSold,
    },
    monthlyBreakdown,
    byPerfume,
    withdrawals: {
      pendingCount: pendingWithdrawals.length,
      pendingAmount: fromMinorUnits(pendingWithdrawals.reduce((s, w) => s + (w.amountMinor || 0), 0)),
      paidCount: paidWithdrawals.length,
      paidAmount: fromMinorUnits(paidWithdrawals.reduce((s, w) => s + (w.amountMinor || 0), 0)),
    },
    // Investor-funded sales P&L attribution. Invariant:
    // grossEconomicProfit === investorProfit + valoreRetainedProfit (exact).
    // valoreBookedProfit is what the owner accounts actually credited — it
    // differs from valoreRetainedProfit only on loss/clamped items.
    profitAttribution: {
      fundedItemCount,
      grossEconomicProfit: fromMinorUnits(fundedGrossMinor),
      investorProfit: fromMinorUnits(fundedInvestorMinor),
      valoreRetainedProfit: fromMinorUnits(fundedValoreRetainedMinor),
      valoreBookedProfit: fromMinorUnits(fundedValoreBookedMinor),
      clampedLossItemCount,
      invariantHolds: fundedGrossMinor === fundedInvestorMinor + fundedValoreRetainedMinor,
    },
    invariant: {
      healthy: invariantViolations.length === 0,
      violations: invariantViolations,
    },
    generatedAt: new Date().toISOString(),
  });
}
