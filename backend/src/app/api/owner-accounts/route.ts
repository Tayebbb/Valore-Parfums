import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { calculatePersonalBottleEarnings } from "@/lib/ownerEarnings";
import { normalizeOrderStatus } from "@/lib/orderStatusConfig";

// GET owner accounts with balances and recent transactions
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch settings, owner accounts, withdrawals, recent profit transactions, and all order items in parallel
  const [settingsDoc, accountsSnap, withdrawalsSnap, transactionsSnap, allItemsSnap, ordersSnap] = await Promise.all([
    db.collection(Collections.settings).doc("default").get(),
    db.collection(Collections.ownerAccounts).get(),
    db.collection(Collections.withdrawals).orderBy("createdAt", "desc").get(),
    db.collection(Collections.profitTransactions).orderBy("createdAt", "desc").limit(100).get(),
    db.collectionGroup("items").get(),
    db.collection(Collections.orders).get(),
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

  // Build order status map to filter dispatched orders only
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orderStatusMap = new Map<string, any>();
  for (const doc of ordersSnap.docs) orderStatusMap.set(doc.id, doc.data());

  // Accumulate per-owner earnings from completed order items using calculatePersonalBottleEarnings
  // for personal_collection items and stored ownerProfit for store-owned items.
  const itemEarningsByOwner: Record<string, { totalEarned: number; storeShareByOwner: Record<string, number> }> = {};
  for (const doc of allItemsSnap.docs) {
    const orderId = doc.ref.parent.parent?.id;
    if (!orderId) continue;
    const order = orderStatusMap.get(orderId);
    if (!order) continue;
    if (normalizeOrderStatus(order.status, order.pickupMethod) !== "Dispatched") continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const item = doc.data() as any;
    const name: string = item.ownerName || "Store";
    if (name === "Store") continue;
    if (!itemEarningsByOwner[name]) itemEarningsByOwner[name] = { totalEarned: 0, storeShareByOwner: {} };

    let ownerEarnings: number;
    let otherOwnerEarnings: number;
    if (item.isPersonalCollection && item.pricingSnapshot) {
      const snap = item.pricingSnapshot;
      const qty = Number(item.quantity ?? 1);
      const result = calculatePersonalBottleEarnings({
        sellingPrice: Number(item.totalPrice ?? 0),
        packagingCost: (Number(snap.packagingCost ?? 0) + Number(snap.bottleCost ?? 0)) * qty,
        productCost: Number(snap.costPricePerMl ?? 0) * Number(item.ml ?? 0) * qty,
      });
      ownerEarnings = result.bottleOwnerEarnings;
      otherOwnerEarnings = result.otherOwnerEarnings;
    } else {
      ownerEarnings = Number(item.ownerProfit ?? 0);
      otherOwnerEarnings = Number(item.otherOwnerProfit ?? 0);
    }

    itemEarningsByOwner[name].totalEarned += ownerEarnings;
    // Track how much this owner's sales generate for the other owner
    if (otherOwnerEarnings > 0) {
      itemEarningsByOwner[name].storeShareByOwner[name] =
        (itemEarningsByOwner[name].storeShareByOwner[name] ?? 0) + otherOwnerEarnings;
    }
  }

  // Build per-owner withdrawal totals
  const withdrawalsByOwner: Record<string, number> = {};
  const withdrawalsList = withdrawalsSnap.docs.map((d) => serializeDoc({ id: d.id, ...d.data() }));
  for (const w of withdrawalsList) {
    const owner = w.ownerName || "Unknown";
    withdrawalsByOwner[owner] = (withdrawalsByOwner[owner] || 0) + (w.amount || 0);
  }

  // Build owner summaries
  const buildOwnerSummary = (name: string, otherName: string) => {
    const account = accountsMap[name] || { totalEarned: 0, storeShareEarned: 0 };
    type LedgerTx = { ownerName?: string; amount?: number; type?: string };
    const ledger = transactionsSnap.docs.reduce(
      (acc, doc) => {
        const tx = doc.data() as LedgerTx;
        if ((tx.ownerName || "") !== name) return acc;
        const amount = Number(tx.amount || 0);
        if (tx.type === "sale" || tx.type === "owner-revenue-base") acc.totalEarned += amount;
        if (tx.type === "cross-owner-share" || tx.type === "store-share") acc.storeShareEarned += amount;
        return acc;
      },
      { totalEarned: 0, storeShareEarned: 0 },
    );
    // Prefer item-based recalculation (uses calculatePersonalBottleEarnings for personal_collection sales)
    const itemBased = itemEarningsByOwner[name];
    const totalEarned = itemBased
      ? Math.round(itemBased.totalEarned)
      : Math.round(ledger.totalEarned || account.totalEarned || 0);
    // storeShareEarned = what came to this owner FROM the other owner's personal_collection sales
    const otherItemBased = itemEarningsByOwner[otherName];
    const storeShareEarned = otherItemBased
      ? Math.round(otherItemBased.storeShareByOwner[otherName] ?? 0)
      : Math.round(ledger.storeShareEarned || account.storeShareEarned || 0);
    const ownerWithdrawals = withdrawalsByOwner[name] || 0;
    const ownerBalance = Math.round(totalEarned + storeShareEarned - ownerWithdrawals);
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
    owners: [buildOwnerSummary(owner1Name, owner2Name), buildOwnerSummary(owner2Name, owner1Name)],
    storeProfitSplit: { owner1Name, owner2Name, owner1Share, owner2Share },
    withdrawals: withdrawalsList,
    transactions,
  });
}
