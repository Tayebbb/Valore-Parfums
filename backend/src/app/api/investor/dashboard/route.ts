import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { requireInvestor, normalizeEmail } from "@/lib/auth";
import { fromMinorUnits } from "@/lib/finance";
import type { InvestmentDoc, InvestorDoc } from "@/lib/investments/types";

// GET investor's own dashboard — investor role (admins may also view their own
// linked profile). The investor is ALWAYS resolved from the session (userId /
// email link), never from query params — IDOR-proof by construction.
export async function GET() {
  const user = await requireInvestor();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Resolve investor by linked userId first, then normalized email.
  let investorDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
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
  if (!investorDoc) {
    return NextResponse.json({ error: "No investor profile linked to this account" }, { status: 404 });
  }

  const investor = investorDoc.data() as InvestorDoc;
  const investmentSnap = await db
    .collection(Collections.investments)
    .where("investorId", "==", investorDoc.id)
    .get();

  const investments = investmentSnap.docs
    .map((d) => {
      const inv = d.data() as InvestmentDoc;
      return serializeDoc({
        id: d.id,
        status: inv.status,
        amount: fromMinorUnits(inv.amountMinor),
        recoveredCapital: fromMinorUnits(inv.recoveredCapitalMinor),
        remainingInventoryCost: fromMinorUnits(inv.remainingInventoryCostMinor),
        availableProfit: fromMinorUnits(inv.availableProfitMinor),
        withdrawnProfit: fromMinorUnits(inv.withdrawnProfitMinor),
        profitSharePercentage: inv.profitSharePercentage,
        recoveryPercent:
          inv.amountMinor > 0
            ? Math.round((inv.recoveredCapitalMinor / inv.amountMinor) * 100)
            : 0,
        createdAt: inv.createdAt,
        closedAt: inv.closedAt,
      });
    })
    .sort((a: { createdAt?: string }, b: { createdAt?: string }) =>
      String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
    );

  return NextResponse.json({
    investor: serializeDoc({
      id: investorDoc.id,
      name: investor.name,
      email: investor.email,
      status: investor.status,
      totalInvested: fromMinorUnits(investor.totalInvestedMinor || 0),
      totalRecoveredCapital: fromMinorUnits(investor.totalRecoveredCapitalMinor || 0),
      totalProfit: fromMinorUnits(investor.totalProfitMinor || 0),
      totalWithdrawn: fromMinorUnits(investor.totalWithdrawnMinor || 0),
      activeInvestmentCount: investor.activeInvestmentCount || 0,
      completedInvestmentCount: investor.completedInvestmentCount || 0,
    }),
    investments,
  });
}
