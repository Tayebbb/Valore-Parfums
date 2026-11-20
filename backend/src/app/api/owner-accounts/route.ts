import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { fromMinorUnits, toMinorUnits } from "@/lib/finance";

// GET owner accounts with balances and recent transactions
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch settings, owner accounts, withdrawals, recent profit transactions, and all order items in parallel
  const [settingsDoc, accountsSnap, withdrawalsSnap, transactionsSnap] = await Promise.all([
    db.collection(Collections.settings).doc("default").get(),
    db.collection(Collections.ownerAccounts).get(),
    db.collection(Collections.withdrawals).orderBy("createdAt", "desc").get(),
    db.collection(Collections.profitTransactions).orderBy("createdAt", "desc").limit(100).get(),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settings = settingsDoc.exists ? (settingsDoc.data() as any) : null;
  const owner1Name = settings?.owner1Name ?? "Tayeb";
  const owner2Name = settings?.owner2Name ?? "Enid";
  const owner1Share = settings?.owner1Share ?? 60;
  const owner2Share = settings?.owner2Share ?? 40;

  // Build accounts map from Firestore
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accountsMap: Record<string, any> = {};
  for (const doc of accountsSnap.docs) {
    accountsMap[doc.id] = { id: doc.id, ...doc.data() };
  }

  // Build per-owner withdrawal totals
  const withdrawalsByOwner: Record<string, number> = {};
  const withdrawalsList = withdrawalsSnap.docs.map((d) => serializeDoc({ id: d.id, ...d.data() }));
  for (const w of withdrawalsList) {
    if ((w.status ?? "Completed") !== "Completed" || (w.withdrawFrom ?? "Owner's Profit") !== "Owner's Profit" || (w.withdrawalType ?? "profit") !== "profit") continue;
    const owner = w.ownerName || "Unknown";
    withdrawalsByOwner[owner] = (withdrawalsByOwner[owner] || 0) + (w.amount || 0);
  }

  // Build owner summaries
  const buildOwnerSummary = (name: string) => {
    const account = accountsMap[name] || { totalEarned: 0, storeShareEarned: 0 };
    const totalEarned = fromMinorUnits(toMinorUnits(Number(account.totalEarned ?? 0)));
    const storeShareEarned = fromMinorUnits(toMinorUnits(Number(account.storeShareEarned ?? 0)));
    const ownerWithdrawals = withdrawalsByOwner[name] || 0;
    const ownerBalance = fromMinorUnits(toMinorUnits(totalEarned + storeShareEarned - ownerWithdrawals));
    return {
      name,
      totalEarned,
      storeShareEarned,
      totalWithdrawn: ownerWithdrawals,
      availableBalance: ownerBalance,
    };
  };

  const transactions = transactionsSnap.docs.map((d) => serializeDoc({ id: d.id, ...d.data() }));

  return NextResponse.json({
    owners: [buildOwnerSummary(owner1Name), buildOwnerSummary(owner2Name)],
    storeProfitSplit: { owner1Name, owner2Name, owner1Share, owner2Share },
    withdrawals: withdrawalsList,
    transactions,
  });
}
