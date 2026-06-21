import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { v4 as uuid } from "uuid";
import { Timestamp } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/auth";
import { fromMinorUnits, toMinorUnits } from "@/lib/finance";
import { normalizeOrderStatus } from "@/lib/orderStatusConfig";
import { calculatePersonalBottleEarnings } from "@/lib/ownerEarnings";

interface OrderDoc {
  id: string;
  status?: string;
  pickupMethod?: string;
  paymentMethod?: string;
  total?: number;
  deliveryFee?: number;
  profit?: number;
  financialsMinor?: {
    totalMinor?: number;
    deliveryFeeMinor?: number;
    totalProfitMinor?: number;
  };
}

// GET all withdrawals — admin only
// Supports ?ownerName=Tayeb filter
export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const ownerName = searchParams.get("ownerName");
  const withdrawalType = searchParams.get("withdrawalType");

  const snap = await db.collection(Collections.withdrawals).orderBy("createdAt", "desc").get();
  let withdrawals = snap.docs.map((doc) => serializeDoc({ id: doc.id, ...doc.data() }));

  if (ownerName) {
    withdrawals = withdrawals.filter((w: { ownerName?: string }) => w.ownerName === ownerName);
  }
  if (withdrawalType) {
    withdrawals = withdrawals.filter((w: { withdrawalType?: string }) => (w.withdrawalType ?? "profit") === withdrawalType);
  }

  return NextResponse.json(withdrawals);
}

// POST create withdrawal — admin only
// Requires ownerName to specify which owner is withdrawing
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const amount = Number(body.amount);
  const note = String(body.note ?? body.purpose ?? "").trim().slice(0, 500);
  const ownerName = String(body.ownerName ?? "").trim();
  const requestedWithdrawFrom = String(body.withdrawFrom ?? "");
  const paymentSourceInput = String(body.paymentSource ?? "");
  const withdrawFrom = requestedWithdrawFrom === "Store Revenue" || body.withdrawalType === "revenue" || requestedWithdrawFrom === "COD Balance" || body.withdrawalType === "cod"
    ? "Store Revenue"
    : "Owner's Profit";
  const paymentSource = paymentSourceInput === "Bkash" || paymentSourceInput === "Bank" || paymentSourceInput === "COD" ? paymentSourceInput : "";

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Amount must be a positive number" }, { status: 400 });
  }
  if (!ownerName || typeof ownerName !== "string") {
    return NextResponse.json({ error: "ownerName is required" }, { status: 400 });
  }
  if (!paymentSource) {
    return NextResponse.json({ error: "paymentSource is required" }, { status: 400 });
  }

  const settingsDoc = await db.collection(Collections.settings).doc("default").get();
  const settings = settingsDoc.exists ? (settingsDoc.data() as Record<string, unknown>) : null;
  const owner1Name = settings?.owner1Name ?? "Tayeb";
  const owner2Name = settings?.owner2Name ?? "Enid";
  const owner1Email = String(settings?.owner1Email ?? "").toLowerCase();
  const owner2Email = String(settings?.owner2Email ?? "").toLowerCase();
  const isOwnerAdmin = admin.email.toLowerCase() === owner1Email || admin.email.toLowerCase() === owner2Email;

  if (!isOwnerAdmin) {
    return NextResponse.json({ error: "Only the two admins can manage withdrawals" }, { status: 403 });
  }

  const [ordersSnap, allItemsSnap] = await Promise.all([
    db.collection(Collections.orders).get(),
    db.collectionGroup("items").get(),
  ]);
  const completedOrders = ordersSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as OrderDoc)).filter((order) => normalizeOrderStatus(order.status, order.pickupMethod) === "Dispatched");
  // Build itemsByOrder map for dispatched orders (needed for personal_collection deductions)
  const dispatchedOrderIds = new Set(completedOrders.map((o) => o.id));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const itemsByOrder = new Map<string, any[]>();
  for (const doc of allItemsSnap.docs) {
    const orderId = doc.ref.parent.parent?.id;
    if (!orderId || !dispatchedOrderIds.has(orderId)) continue;
    const list = itemsByOrder.get(orderId) || [];
    list.push({ id: doc.id, ...doc.data() });
    itemsByOrder.set(orderId, list);
  }
  const completedCodOrders = completedOrders.filter((order) => String(order.paymentMethod || "") === "Cash on Delivery");
  const storeRevenueMinorForOrder = (order: OrderDoc) => {
    const totalMinor = Number(order?.financialsMinor?.totalMinor ?? toMinorUnits(order.total ?? 0));
    const deliveryFeeMinor = Number(order?.financialsMinor?.deliveryFeeMinor ?? toMinorUnits(order.deliveryFee ?? 0));
    return Math.max(0, totalMinor - deliveryFeeMinor);
  };
  // Delivery fee is excluded from revenue — merchant app auto-deducts it before remitting.
  const codRevenueMinorForOrder = (order: OrderDoc) => {
    const totalMinor = Number(order?.financialsMinor?.totalMinor ?? toMinorUnits(order.total ?? 0));
    const deliveryFeeMinor = Number(order?.financialsMinor?.deliveryFeeMinor ?? toMinorUnits(order.deliveryFee ?? 0));
    return Math.max(0, totalMinor - deliveryFeeMinor);
  };
  // Deduct payouts from store revenue: personal_collection owner payouts
  // and store-owned item profit (already distributed to owners).
  type RevenueDeductionItem = {
    ownerName?: string;
    totalPrice?: number;
    costPrice?: number;
    isPersonalCollection?: boolean;
    quantity?: number;
    ml?: number;
    pricingSnapshot?: {
      packagingCost?: number;
      bottleCost?: number;
      costPricePerMl?: number;
    };
  };
  const personalCollectionDeductionMinor = (orderId: string): number => {
    const items = (itemsByOrder.get(orderId) || []) as RevenueDeductionItem[];
    let deductionMinor = 0;
    for (const item of items) {
      if (!item.isPersonalCollection || (item.ownerName || "Store") === "Store") continue;
      const snap = item.pricingSnapshot;
      if (!snap) continue;
      const qty = Number(item.quantity ?? 1);
      const result = calculatePersonalBottleEarnings({
        sellingPrice: Number(item.totalPrice ?? 0),
        packagingCost: (Number(snap.packagingCost ?? 0) + Number(snap.bottleCost ?? 0)) * qty,
        productCost: Number(snap.costPricePerMl ?? 0) * Number(item.ml ?? 0) * qty,
      });
      deductionMinor += toMinorUnits(result.bottleOwnerEarnings + result.otherOwnerEarnings);
    }
    return deductionMinor;
  };
  const storeProfitDeductionMinor = (orderId: string): number => {
    const items = (itemsByOrder.get(orderId) || []) as RevenueDeductionItem[];
    let deductionMinor = 0;
    for (const item of items) {
      if ((item.ownerName || "Store") !== "Store") continue;
      const totalPriceMinor = toMinorUnits(Number(item.totalPrice ?? 0));
      const costPriceMinor = toMinorUnits(Number(item.costPrice ?? 0));
      const storeProfitMinor = Math.max(0, totalPriceMinor - costPriceMinor);
      deductionMinor += storeProfitMinor;
    }
    return deductionMinor;
  };
  const totalRevenueDeductionMinor = (orderId: string) =>
    personalCollectionDeductionMinor(orderId) + storeProfitDeductionMinor(orderId);
  const sourceTotalsMinor = {
    Bkash: completedOrders.filter((order) => String(order.paymentMethod || "") === "Bkash Manual").reduce((sum: number, order) => sum + Math.max(0, storeRevenueMinorForOrder(order) - totalRevenueDeductionMinor(order.id)), 0),
    Bank: completedOrders.filter((order) => String(order.paymentMethod || "") === "Bank Manual").reduce((sum: number, order) => sum + Math.max(0, storeRevenueMinorForOrder(order) - totalRevenueDeductionMinor(order.id)), 0),
    COD: completedCodOrders.reduce((sum: number, order) => sum + Math.max(0, codRevenueMinorForOrder(order) - totalRevenueDeductionMinor(order.id)), 0),
  };

  const revenueWithdrawalsSnap = await db.collection(Collections.withdrawals).get();
  type WithdrawalDoc = {
    id: string;
    amount?: number;
    status?: string;
    paymentSource?: string;
    withdrawFrom?: string;
    withdrawalType?: string;
  };
  const completedWithdrawals = revenueWithdrawalsSnap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as Omit<WithdrawalDoc, "id">) }))
    .filter((w) => (w.status ?? "Completed") === "Completed");
  const completedRevenueWithdrawals = completedWithdrawals.filter(
    (w) => (w.withdrawFrom ?? (w.withdrawalType === "revenue" ? "Store Revenue" : "Owner's Profit")) === "Store Revenue",
  );
  const sourceWithdrawnMinor = {
    Bkash: completedRevenueWithdrawals.filter((w) => String(w.paymentSource || "") === "Bkash").reduce((sum: number, w) => sum + toMinorUnits(Number(w.amount || 0)), 0),
    Bank: completedRevenueWithdrawals.filter((w) => String(w.paymentSource || "") === "Bank").reduce((sum: number, w) => sum + toMinorUnits(Number(w.amount || 0)), 0),
    COD: completedRevenueWithdrawals.filter((w) => String(w.paymentSource || "") === "COD").reduce((sum: number, w) => sum + toMinorUnits(Number(w.amount || 0)), 0),
  };

  const sourceBalanceMinor = {
    Bkash: Math.max(0, sourceTotalsMinor.Bkash - sourceWithdrawnMinor.Bkash),
    Bank: Math.max(0, sourceTotalsMinor.Bank - sourceWithdrawnMinor.Bank),
    COD: Math.max(0, sourceTotalsMinor.COD - sourceWithdrawnMinor.COD),
  };

  const paymentSourceBalance = sourceBalanceMinor[paymentSource as keyof typeof sourceBalanceMinor] || 0;
  if (withdrawFrom === "Store Revenue") {
    if (amount > fromMinorUnits(paymentSourceBalance)) {
      return NextResponse.json({ error: `Insufficient ${paymentSource} balance. Available: ${Math.round(fromMinorUnits(paymentSourceBalance))} BDT` }, { status: 400 });
    }

    const id = uuid();
    const now = Timestamp.now();
    const balanceAfter = fromMinorUnits(Math.max(0, paymentSourceBalance - toMinorUnits(amount)));
    const data = {
      amount,
      ownerName: "Store",
      withdrawFrom: "Store Revenue",
      paymentSource,
      note,
      requestedBy: admin.name,
      requestedByEmail: admin.email,
      withdrawnBy: admin.name,
      approvals: [{ name: admin.name, email: admin.email, approvedAt: now }],
      approvedBy: [admin.name],
      status: "Completed",
      balanceBefore: fromMinorUnits(paymentSourceBalance),
      balanceAfter,
      createdAt: now,
      updatedAt: now,
      completedAt: now,
    };

    await db.collection(Collections.withdrawals).doc(id).set(data);

    const txId = uuid();
    await db.collection(Collections.profitTransactions).doc(txId).set({
      orderId: null,
      ownerName: "Store",
      type: "revenue-withdrawal",
      amount: -amount,
      paymentSource,
      withdrawFrom: "Store Revenue",
      description: `Store revenue withdrawal for ${String(note || "business expense").slice(0, 200)}`,
      createdAt: now,
    });

    return NextResponse.json(serializeDoc({ id, ...data }), { status: 201 });
  }

  if (ownerName !== owner1Name && ownerName !== owner2Name) {
    return NextResponse.json({ error: "Owner account not properly configured or unrecognized" }, { status: 403 });
  }

  const ownerEmail = ownerName === owner1Name ? owner1Email : owner2Email;
  if (!ownerEmail || admin.email.toLowerCase() !== ownerEmail.toLowerCase()) {
    return NextResponse.json({ error: "You can only withdraw from your own account" }, { status: 403 });
  }

  const accountDoc = await db.collection(Collections.ownerAccounts).doc(ownerName).get();
  const account = accountDoc.exists ? (accountDoc.data() as { totalEarned?: number }) : { totalEarned: 0 };
  const wSnap = await db.collection(Collections.withdrawals).where("ownerName", "==", ownerName).get();
  const totalWithdrawn = wSnap.docs.reduce((sum, doc) => {
    const withdrawal = doc.data() as { withdrawFrom?: string; amount?: number };
    if ((withdrawal.withdrawFrom ?? "Owner's Profit") !== "Owner's Profit") return sum;
    return sum + Number(withdrawal.amount || 0);
  }, 0);
  const available = Number(account.totalEarned || 0) - totalWithdrawn;
  if (amount > available) {
    return NextResponse.json({ error: `Insufficient balance. Available: ${Math.round(available)} BDT` }, { status: 400 });
  }

  const id = uuid();
  const now = Timestamp.now();
  const balanceAfter = Math.max(0, available - amount);
  const data = {
    amount,
    ownerName,
    withdrawFrom: "Owner's Profit",
    paymentSource,
    note,
    withdrawnBy: admin.name,
    approvals: [{ name: admin.name, email: admin.email, approvedAt: now }],
    approvedBy: [admin.name],
    status: "Completed",
    balanceBefore: available,
    balanceAfter,
    createdAt: now,
    updatedAt: now,
    completedAt: now,
  };

  await db.collection(Collections.withdrawals).doc(id).set(data);

  const txId = uuid();
  await db.collection(Collections.profitTransactions).doc(txId).set({
    orderId: null,
    ownerName,
    type: "withdrawal-profit",
    amount: -amount,
    paymentSource,
    withdrawFrom: "Owner's Profit",
    description: `Withdrawal by ${admin.name}${note ? `: ${note.slice(0, 200)}` : ""}`,
    createdAt: now,
  });

  return NextResponse.json(serializeDoc({ id, ...data }), { status: 201 });
}
