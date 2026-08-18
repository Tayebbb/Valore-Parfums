import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { requireInvestor, normalizeEmail } from "@/lib/auth";
import { fromMinorUnits } from "@/lib/finance";
import type {
  InvestmentDoc,
  InvestorDoc,
  LedgerEntryDoc,
} from "@/lib/investments/types";

// GET the investor account statement (§ spec: "current position of my investment").
// - Investors: always resolved from the session (userId → email) — IDOR-proof.
// - Admins: may pass ?investorId= to generate any investor's statement.
// All money values in MAJOR units (investor-portal convention, like /api/investor/dashboard).
export async function GET(req: Request) {
  const user = await requireInvestor();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const requestedInvestorId = searchParams.get("investorId");

  let investorDoc:
    | FirebaseFirestore.QueryDocumentSnapshot
    | FirebaseFirestore.DocumentSnapshot
    | null = null;

  if (requestedInvestorId && user.role === "admin") {
    // Admin statement generation for any investor.
    const doc = await db.collection(Collections.investors).doc(requestedInvestorId).get();
    if (doc.exists) investorDoc = doc;
  } else {
    // Session-resolved own profile (investorId param ignored for non-admins).
    const byUser = await db
      .collection(Collections.investors)
      .where("userId", "==", user.id)
      .limit(1)
      .get();
    if (!byUser.empty) {
      investorDoc = byUser.docs[0];
    } else {
      const byEmail = await db
        .collection(Collections.investors)
        .where("email", "==", normalizeEmail(user.email))
        .limit(1)
        .get();
      if (!byEmail.empty) investorDoc = byEmail.docs[0];
    }
  }

  if (!investorDoc) {
    return NextResponse.json(
      { error: "No investor profile linked to this account" },
      { status: 404 }
    );
  }

  const investorId = investorDoc.id;
  const investor = investorDoc.data() as InvestorDoc;

  const [investmentSnap, ledgerSnap] = await Promise.all([
    db.collection(Collections.investments).where("investorId", "==", investorId).get(),
    db
      .collection(Collections.investmentTransactions)
      .where("investorId", "==", investorId)
      .get(),
  ]);

  const toDate = (ts: unknown): Date => {
    if (ts && typeof ts === "object" && "toDate" in ts && typeof (ts as { toDate?: unknown }).toDate === "function") {
      return (ts as { toDate: () => Date }).toDate();
    }
    return new Date(ts as string | number | Date);
  };

  // ── Per-investment position (oldest first: first = original capital, rest = additional) ──
  const investments = investmentSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as InvestmentDoc) }))
    .sort((a, b) => toDate(a.createdAt).getTime() - toDate(b.createdAt).getTime());

  let totalInvestedMinor = 0;
  let recoveredMinor = 0;
  let remainingMinor = 0;
  let availableProfitMinor = 0;
  let withdrawnProfitMinor = 0;
  let buybackTodayMinor = 0;

  const investmentRows = investments.map((inv, idx) => {
    totalInvestedMinor += inv.amountMinor || 0;
    recoveredMinor += inv.recoveredCapitalMinor || 0;
    remainingMinor += inv.remainingInventoryCostMinor || 0;
    availableProfitMinor += inv.availableProfitMinor || 0;
    withdrawnProfitMinor += inv.withdrawnProfitMinor || 0;
    const isOpen = inv.status === "active" || inv.status === "recovering";
    if (isOpen) {
      // Buyback = remaining inventory cost + positive available profit (never negative).
      buybackTodayMinor +=
        (inv.remainingInventoryCostMinor || 0) + Math.max(0, inv.availableProfitMinor || 0);
    }
    return serializeDoc({
      id: inv.id,
      label: idx === 0 ? "Original capital" : "Additional capital",
      status: inv.status,
      profitSharePercentage: inv.profitSharePercentage,
      amount: fromMinorUnits(inv.amountMinor || 0),
      recoveredCapital: fromMinorUnits(inv.recoveredCapitalMinor || 0),
      remainingInventoryCost: fromMinorUnits(inv.remainingInventoryCostMinor || 0),
      availableProfit: fromMinorUnits(inv.availableProfitMinor || 0),
      withdrawnProfit: fromMinorUnits(inv.withdrawnProfitMinor || 0),
      realizedProfit: fromMinorUnits(
        (inv.availableProfitMinor || 0) + (inv.withdrawnProfitMinor || 0)
      ),
      createdAt: inv.createdAt,
      closedAt: inv.closedAt,
    });
  });

  const originalCapitalMinor = investments.length > 0 ? investments[0].amountMinor || 0 : 0;
  const additionalCapitalMinor = totalInvestedMinor - originalCapitalMinor;
  const realizedProfitMinor = availableProfitMinor + withdrawnProfitMinor;

  // ── Monthly breakdown + full transaction history from the immutable ledger ──
  const entries = ledgerSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as LedgerEntryDoc) }))
    .sort((a, b) => toDate(b.createdAt).getTime() - toDate(a.createdAt).getTime());

  const monthly: Record<string, { capitalRecoveredMinor: number; profitMinor: number }> = {};
  for (const e of entries) {
    if (e.type !== "capital_recovery" && e.type !== "profit_generated") continue;
    const d = toDate(e.createdAt);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!monthly[key]) monthly[key] = { capitalRecoveredMinor: 0, profitMinor: 0 };
    if (e.type === "capital_recovery") monthly[key].capitalRecoveredMinor += e.amountMinor || 0;
    else monthly[key].profitMinor += e.amountMinor || 0;
  }
  const monthlyBreakdown = Object.entries(monthly)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, m]) => ({
      month,
      capitalRecovered: fromMinorUnits(m.capitalRecoveredMinor),
      profit: fromMinorUnits(m.profitMinor),
    }));

  const transactions = entries.map((e) =>
    serializeDoc({
      id: e.id,
      type: e.type,
      stream: e.stream,
      investmentId: e.investmentId,
      amount: fromMinorUnits(e.amountMinor || 0),
      balanceAfter: fromMinorUnits(e.newBalanceMinor || 0),
      mlSold: e.mlSold,
      notes: e.notes || "",
      createdAt: e.createdAt,
    })
  );

  return NextResponse.json({
    investor: serializeDoc({
      id: investorId,
      name: investor.name,
      email: investor.email,
      phone: investor.phone || "",
      status: investor.status,
      memberSince: investor.createdAt,
    }),
    position: {
      originalCapital: fromMinorUnits(originalCapitalMinor),
      additionalCapital: fromMinorUnits(additionalCapitalMinor),
      totalCapitalInvested: fromMinorUnits(totalInvestedMinor),
      recoveredCapital: fromMinorUnits(recoveredMinor),
      remainingInventoryCost: fromMinorUnits(remainingMinor),
      realizedProfit: fromMinorUnits(realizedProfitMinor),
      profitWithdrawn: fromMinorUnits(withdrawnProfitMinor),
      availableProfit: fromMinorUnits(availableProfitMinor),
      // Remaining capital exposure + withdrawable profit = what the account is worth today.
      currentAccountValue: fromMinorUnits(remainingMinor + availableProfitMinor),
      buybackValueToday: fromMinorUnits(buybackTodayMinor),
      roiPercent:
        totalInvestedMinor > 0
          ? Math.round((realizedProfitMinor / totalInvestedMinor) * 10000) / 100
          : 0,
      activeInvestmentCount: investor.activeInvestmentCount || 0,
      completedInvestmentCount: investor.completedInvestmentCount || 0,
    },
    investments: investmentRows,
    monthlyBreakdown,
    transactions,
    generatedAt: new Date().toISOString(),
  });
}
