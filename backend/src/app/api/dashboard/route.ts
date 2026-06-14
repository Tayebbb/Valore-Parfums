import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { fromMinorUnits, toMinorUnits } from "@/lib/finance";
import { calculatePersonalBottleEarnings } from "@/lib/ownerEarnings";
import { normalizeOrderStatus } from "@/lib/orderStatusConfig";

// Helper: convert Firestore Timestamp to Date
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toDate(ts: any): Date {
  return ts?.toDate ? ts.toDate() : new Date(ts);
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Fetch all orders, perfumes, bottles, stock requests, settings, and ALL order items in parallel
  // Using collectionGroup("items") avoids N+1 subcollection reads
  const [ordersSnap, perfumesSnap, bottlesSnap, stockRequestsSnap, settingsDoc, allItemsSnap, ownerAccountsSnap, withdrawalsSnap, fulfilledRequestsSnap, profitTransactionsSnap] = await Promise.all([
    db.collection(Collections.orders).get(),
    db.collection(Collections.perfumes).orderBy("totalStockMl", "asc").get(),
    db.collection(Collections.bottles).orderBy("availableCount", "asc").get(),
    db.collection(Collections.stockRequests).get(),
    db.collection(Collections.settings).doc("default").get(),
    db.collectionGroup("items").get(),
    db.collection(Collections.ownerAccounts).get(),
    db.collection(Collections.withdrawals).get(),
    db.collection(Collections.requests).where("status", "==", "Fulfilled").get(),
    db.collection(Collections.profitTransactions).get(),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allOrders = ordersSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];

  // Build items map keyed by parent order ID and order lookup
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orderMap = new Map<string, any>();
  for (const o of allOrders) orderMap.set(o.id, o);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const itemsByOrder = new Map<string, any[]>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allItems: any[] = [];
  for (const doc of allItemsSnap.docs) {
    const orderId = doc.ref.parent.parent?.id;
    if (!orderId) continue;
    const order = orderMap.get(orderId);
    if (!order) continue;
    const itemData = { ...doc.data(), orderId, orderStatus: order.status, orderCreatedAt: order.createdAt };
    allItems.push(itemData);
    const list = itemsByOrder.get(orderId) || [];
    list.push({ id: doc.id, ...doc.data() });
    itemsByOrder.set(orderId, list);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const perfumes = perfumesSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bottles = bottlesSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stockRequestsList = stockRequestsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settings = settingsDoc.exists ? (settingsDoc.data() as any) : null;

  // Aggregates (replaces prisma.order.count, prisma.order.aggregate)
  const normalizedOrders = allOrders.map((order) => ({ ...order, normalizedStatus: normalizeOrderStatus(order.status, order.pickupMethod) }));
  const revenueMinorExcludingDelivery = (order: Record<string, unknown>) => {
    const totalMinor = Number((order.financialsMinor as { totalMinor?: number } | undefined)?.totalMinor ?? toMinorUnits(Number(order.total ?? 0)));
    const deliveryFeeMinor = Number((order.financialsMinor as { deliveryFeeMinor?: number } | undefined)?.deliveryFeeMinor ?? toMinorUnits(Number(order.deliveryFee ?? 0)));
    return Math.max(0, totalMinor - deliveryFeeMinor);
  };
  const totalOrders = normalizedOrders.length;
  const completedOrders = normalizedOrders.filter((o) => o.normalizedStatus === "Dispatched").length;
  const pendingOrders = normalizedOrders.filter((o) => ["Pending", "Confirmed", "Sourcing", "Ready"].includes(o.normalizedStatus)).length;
  const pendingBkashVerifications = allOrders.filter((o) => o.status === "Pending Bkash Verification").length;
  const pendingBankVerifications = allOrders.filter((o) => o.status === "Pending Bank Verification").length;
  const completedOrderList = normalizedOrders.filter((o) => o.normalizedStatus === "Dispatched");
  const totalRevenueMinor = completedOrderList.reduce((s, o) => s + revenueMinorExcludingDelivery(o), 0);
  const totalProfitMinor = completedOrderList.reduce((s, o) => s + Number(o?.financialsMinor?.totalProfitMinor ?? toMinorUnits(o.profit ?? 0)), 0);
  const totalRevenue = fromMinorUnits(totalRevenueMinor);
  const totalProfitVal = fromMinorUnits(totalProfitMinor);

  // Today aggregates
  const todayOrdersNonCancelled = normalizedOrders.filter((o) => toDate(o.createdAt) >= startOfDay && o.normalizedStatus !== "Cancelled");
  const todayCompleted = normalizedOrders.filter((o) => toDate(o.createdAt) >= startOfDay && o.normalizedStatus === "Dispatched");
  const todayOrders = todayOrdersNonCancelled.length;
  const todayRevenue = fromMinorUnits(todayCompleted.reduce((s, o) => s + revenueMinorExcludingDelivery(o), 0));
  const todayProfitVal = fromMinorUnits(todayCompleted.reduce((s, o) => s + Number(o?.financialsMinor?.totalProfitMinor ?? toMinorUnits(o.profit ?? 0)), 0));

  // Month aggregates
  const monthCompleted = normalizedOrders.filter((o) => toDate(o.createdAt) >= startOfMonth && o.normalizedStatus === "Dispatched");
  const monthRevenue = fromMinorUnits(monthCompleted.reduce((s, o) => s + revenueMinorExcludingDelivery(o), 0));
  const monthProfitVal = fromMinorUnits(monthCompleted.reduce((s, o) => s + Number(o?.financialsMinor?.totalProfitMinor ?? toMinorUnits(o.profit ?? 0)), 0));

  // Low stock perfumes (replaces prisma.perfume.findMany take 10 + filter)
  const lowStockMl = settings?.lowStockAlertMl ?? 20;
  const lowStockPerfumes = perfumes.slice(0, 10).filter((p) => p.totalStockMl <= (p.lowStockThreshold ?? lowStockMl) || p.totalStockMl <= lowStockMl);

  // Low stock bottles
  const lowStockBottles = bottles.filter((b) => b.availableCount <= (b.lowStockThreshold ?? 5));

  // Stock requests count (replaces prisma.stockRequest.count with status Pending)
  const stockRequests = normalizedOrders.filter((o) => o.orderSource === "stock_request" && o.normalizedStatus === "Sourcing").length || stockRequestsList.filter((r) => r.status === "Pending").length;

  // Recent orders (last 5) — items already in memory from collectionGroup
  const sortedOrders = [...allOrders].sort((a, b) => toDate(b.createdAt).getTime() - toDate(a.createdAt).getTime());
  const recentOrderDocs = sortedOrders.slice(0, 5);
  const recentOrders = recentOrderDocs.map((o) =>
    serializeDoc({ ...o, items: itemsByOrder.get(o.id) || [] })
  );

  // Most sold perfumes — items already collected from collectionGroup
  const soldMap = new Map<string, { quantity: number; totalPrice: number }>();
  for (const item of allItems) {
    const existing = soldMap.get(item.perfumeName);
    if (existing) {
      existing.quantity += item.quantity ?? 0;
      existing.totalPrice += item.totalPrice ?? 0;
    } else {
      soldMap.set(item.perfumeName, { quantity: item.quantity ?? 0, totalPrice: item.totalPrice ?? 0 });
    }
  }
  const mostSold = Array.from(soldMap.entries())
    .map(([perfumeName, agg]) => ({ perfumeName, _sum: { quantity: agg.quantity, totalPrice: agg.totalPrice } }))
    .sort((a, b) => b._sum.quantity - a._sum.quantity)
    .slice(0, 6);

  // Most requested (replaces prisma.stockRequest.groupBy by perfumeName)
  const requestedMap = new Map<string, number>();
  for (const r of stockRequestsList) {
    requestedMap.set(r.perfumeName, (requestedMap.get(r.perfumeName) ?? 0) + 1);
  }
  const mostRequested = Array.from(requestedMap.entries())
    .map(([perfumeName, count]) => ({ perfumeName, _count: count }))
    .sort((a, b) => b._count - a._count)
    .slice(0, 5);

  // Daily sales (last 7 days) — replaces prisma.order.aggregate per day
  const dailySales: { date: string; revenue: number; profit: number; orders: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    const dayCompleted = completedOrderList.filter((o) => {
      const d = toDate(o.createdAt);
      return d >= dayStart && d < dayEnd;
    });
    dailySales.push({
      date: dayStart.toISOString().split("T")[0],
      revenue: fromMinorUnits(dayCompleted.reduce((s, o) => s + revenueMinorExcludingDelivery(o), 0)),
      profit: fromMinorUnits(dayCompleted.reduce((s, o) => s + Number(o?.financialsMinor?.totalProfitMinor ?? toMinorUnits(o.profit ?? 0)), 0)),
      orders: dayCompleted.length,
    });
  }

  // Monthly sales (last 6 months) — replaces prisma.order.aggregate per month
  const monthlySales: { month: string; revenue: number; profit: number; orders: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const mCompleted = completedOrderList.filter((o) => {
      const d = toDate(o.createdAt);
      return d >= mStart && d < mEnd;
    });
    monthlySales.push({
      month: mStart.toLocaleString("default", { month: "short", year: "2-digit" }),
      revenue: fromMinorUnits(mCompleted.reduce((s, o) => s + revenueMinorExcludingDelivery(o), 0)),
      profit: fromMinorUnits(mCompleted.reduce((s, o) => s + Number(o?.financialsMinor?.totalProfitMinor ?? toMinorUnits(o.profit ?? 0)), 0)),
      orders: mCompleted.length,
    });
  }

  // Ownership profit breakdown from actual order items (replaces prisma.orderItem.findMany with order include)
  const completedItems = allItems.filter((i) => normalizeOrderStatus(i.orderStatus) === "Dispatched");
  const ownershipBreakdown: Record<string, { total: number; today: number; month: number }> = {};
  const ownershipWithStoreShareBreakdown: Record<string, { total: number; today: number; month: number }> = {};
  // Per-owner cross earnings: when owner A sells, the otherOwnerEarnings go to the other owner
  const crossOwnerEarningsByOwner: Record<string, { total: number; today: number; month: number }> = {};
  let crossOwnerTotal = 0, crossOwnerToday = 0, crossOwnerMonth = 0;
  const owner1Name: string = settings?.owner1Name ?? "Tayeb";
  const owner2Name: string = settings?.owner2Name ?? "Enid";

  for (const item of completedItems) {
    const name = item.ownerName || "Store";

    // For Store items, ownerProfit = owner1 (Tayeb) 60%, otherOwnerProfit = owner2 (Enid) 40%
    // Attribute to owner1/owner2 rather than generic "Store" bucket
    const effectiveName = name === "Store" ? owner1Name : name;
    if (!ownershipBreakdown[effectiveName]) ownershipBreakdown[effectiveName] = { total: 0, today: 0, month: 0 };
    if (!ownershipWithStoreShareBreakdown[effectiveName]) ownershipWithStoreShareBreakdown[effectiveName] = { total: 0, today: 0, month: 0 };
    const effectiveOtherOwner = effectiveName === owner1Name ? owner2Name : owner1Name;
    if (!crossOwnerEarningsByOwner[effectiveOtherOwner]) crossOwnerEarningsByOwner[effectiveOtherOwner] = { total: 0, today: 0, month: 0 };

    let itemOwnerProfit: number;
    let itemOtherOwnerProfit: number;
    if (item.isPersonalCollection && name !== "Store" && item.pricingSnapshot) {
      const snap = item.pricingSnapshot;
      const qty = Number(item.quantity ?? 1);
      const earningsResult = calculatePersonalBottleEarnings({
        sellingPrice: Number(item.totalPrice ?? 0),
        packagingCost: (Number(snap.packagingCost ?? 0) + Number(snap.bottleCost ?? 0)) * qty,
        productCost: Number(snap.costPricePerMl ?? 0) * Number(item.ml ?? 0) * qty,
      });
      itemOwnerProfit = earningsResult.bottleOwnerEarnings;
      itemOtherOwnerProfit = earningsResult.otherOwnerEarnings;
    } else {
      itemOwnerProfit = item.ownerProfit ?? 0;
      itemOtherOwnerProfit = item.otherOwnerProfit ?? 0;
    }

    ownershipBreakdown[effectiveName].total += itemOwnerProfit;
    ownershipWithStoreShareBreakdown[effectiveName].total += itemOwnerProfit + itemOtherOwnerProfit;
    crossOwnerTotal += itemOtherOwnerProfit;
    crossOwnerEarningsByOwner[effectiveOtherOwner].total += itemOtherOwnerProfit;
    const createdAt = toDate(item.orderCreatedAt);
    if (createdAt >= startOfDay) {
      ownershipBreakdown[effectiveName].today += itemOwnerProfit;
      ownershipWithStoreShareBreakdown[effectiveName].today += itemOwnerProfit + itemOtherOwnerProfit;
      crossOwnerToday += itemOtherOwnerProfit;
      crossOwnerEarningsByOwner[effectiveOtherOwner].today += itemOtherOwnerProfit;
    }
    if (createdAt >= startOfMonth) {
      ownershipBreakdown[effectiveName].month += itemOwnerProfit;
      ownershipWithStoreShareBreakdown[effectiveName].month += itemOwnerProfit + itemOtherOwnerProfit;
      crossOwnerMonth += itemOtherOwnerProfit;
      crossOwnerEarningsByOwner[effectiveOtherOwner].month += itemOtherOwnerProfit;
    }
  }

  // Ledger-based owner earnings, matching owner account totals and store share credits
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profitTransactions = profitTransactionsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
  const ownerLedgerBreakdown: Record<string, { total: number; today: number; month: number }> = {};
  for (const tx of profitTransactions) {
    const ownerName = tx.ownerName || "Unknown";
    if (!ownerLedgerBreakdown[ownerName]) ownerLedgerBreakdown[ownerName] = { total: 0, today: 0, month: 0 };
    const amount = Number(tx.amount || 0);
    ownerLedgerBreakdown[ownerName].total += amount;
    const createdAt = tx.createdAt ? toDate(tx.createdAt) : null;
    if (createdAt && createdAt >= startOfDay) ownerLedgerBreakdown[ownerName].today += amount;
    if (createdAt && createdAt >= startOfMonth) ownerLedgerBreakdown[ownerName].month += amount;
  }

  // Aggregate profit from fulfilled perfume requests
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fulfilledRequests = fulfilledRequestsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
  let requestProfitTotal = 0;
  let requestProfitToday = 0;
  let requestProfitMonth = 0;

  for (const r of fulfilledRequests) {
    const profit = r.profit ?? 0;
    requestProfitTotal += profit;
    const fulfilledAt = r.fulfilledAt ? toDate(r.fulfilledAt) : null;
    if (fulfilledAt && fulfilledAt >= startOfDay) requestProfitToday += profit;
    if (fulfilledAt && fulfilledAt >= startOfMonth) requestProfitMonth += profit;
  }

  const completedPaymentOrders = normalizedOrders.filter(
    (o) => o.normalizedStatus !== "Cancelled" && ["Bkash Manual", "Bank Manual"].includes(String(o.paymentMethod || "")),
  );
  const completedCodOrders = completedOrderList.filter((o) => String(o.paymentMethod || "") === "Cash on Delivery");
  type OrderRevenueShape = {
    financialsMinor?: { totalMinor?: number; totalProfitMinor?: number; deliveryFeeMinor?: number };
    total?: number;
    profit?: number;
    deliveryFee?: number;
  };
  const storeRevenueMinorForOrder = (order: OrderRevenueShape) => {
    const orderTotalMinor = Number(order?.financialsMinor?.totalMinor ?? toMinorUnits(order.total ?? 0));
    const orderDeliveryFeeMinor = Number(order?.financialsMinor?.deliveryFeeMinor ?? toMinorUnits(order.deliveryFee ?? 0));
    return Math.max(0, orderTotalMinor - orderDeliveryFeeMinor);
  };
  // For COD, the customer pays the full amount in cash (including delivery fee),
  // so the delivery fee is part of the physical cash received and must be included.
  const codRevenueMinorForOrder = (order: OrderRevenueShape) => {
    return Math.max(0, Number(order?.financialsMinor?.totalMinor ?? toMinorUnits(order.total ?? 0)));
  };
  const bkashPaymentsMinor = completedPaymentOrders
    .filter((o) => String(o.paymentMethod || "") === "Bkash Manual")
    .reduce((sum, o) => sum + storeRevenueMinorForOrder(o), 0);
  const bankPaymentsMinor = completedPaymentOrders
    .filter((o) => String(o.paymentMethod || "") === "Bank Manual")
    .reduce((sum, o) => sum + storeRevenueMinorForOrder(o), 0);
  const codPaymentsMinor = completedCodOrders.reduce((sum, o) => sum + codRevenueMinorForOrder(o), 0);

  // Per-source withdrawable amounts: gross minus what is owed to bottle owners for personal_collection items
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const personalCollectionDeductionForOrder = (orderId: string): number => {
    const items: any[] = itemsByOrder.get(orderId) || [];
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
  const bkashWithdrawableMinor = completedOrderList
    .filter((o) => String(o.paymentMethod || "") === "Bkash Manual")
    .reduce((sum, o) => sum + Math.max(0, storeRevenueMinorForOrder(o) - personalCollectionDeductionForOrder(o.id)), 0);
  const bankWithdrawableMinor = completedOrderList
    .filter((o) => String(o.paymentMethod || "") === "Bank Manual")
    .reduce((sum, o) => sum + Math.max(0, storeRevenueMinorForOrder(o) - personalCollectionDeductionForOrder(o.id)), 0);
  const codWithdrawableMinor = completedOrderList
    .filter((o) => String(o.paymentMethod || "") === "Cash on Delivery")
    .reduce((sum, o) => sum + Math.max(0, codRevenueMinorForOrder(o) - personalCollectionDeductionForOrder(o.id)), 0);

  type RevenueWithdrawalDoc = {
    id: string;
    amount?: number;
    status?: string;
    paymentSource?: string;
    withdrawFrom?: string;
    withdrawalType?: string;
    ownerName?: string;
    createdAt?: unknown;
    updatedAt?: unknown;
    completedAt?: unknown;
    note?: string;
  };

  type RevenueEvent = {
    createdAt: Date;
    amount: number;
    source: string;
    kind: "payment" | "withdrawal";
  };

  const revenueWithdrawalDocs = withdrawalsSnap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as Omit<RevenueWithdrawalDoc, "id">) }))
    .filter((w) => w.withdrawFrom === "Store Revenue" || w.withdrawalType === "revenue" || w.withdrawFrom === "COD Balance" || w.withdrawalType === "cod" || w.ownerName === "Store");
  const completedRevenueWithdrawals = revenueWithdrawalDocs.filter((w) => (w.status ?? "Pending Approval") === "Completed");

  const bkashWithdrawnMinor = completedRevenueWithdrawals
    .filter((w) => w.paymentSource === "Bkash")
    .reduce((sum, w) => sum + toMinorUnits(Number(w.amount || 0)), 0);
  const bankWithdrawnMinor = completedRevenueWithdrawals
    .filter((w) => w.paymentSource === "Bank")
    .reduce((sum, w) => sum + toMinorUnits(Number(w.amount || 0)), 0);
  const totalRevenueWithdrawnMinor = completedRevenueWithdrawals.reduce((sum, w) => sum + toMinorUnits(Number(w.amount || 0)), 0);

  const codWithdrawalDocs = withdrawalsSnap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as Omit<RevenueWithdrawalDoc, "id">) }))
    .filter((w) => String(w.paymentSource || "") === "COD");
  const completedCodWithdrawals = codWithdrawalDocs.filter((w) => (w.status ?? "Pending Approval") === "Completed");
  const codWithdrawnMinor = completedRevenueWithdrawals
    .filter((w) => String(w.paymentSource || "") === "COD")
    .reduce((sum, w) => sum + toMinorUnits(Number(w.amount || 0)), 0);
  const latestCodWithdrawal = [...completedCodWithdrawals].sort((a, b) => toDate(b.createdAt).getTime() - toDate(a.createdAt).getTime())[0] || null;

  const revenueEvents: RevenueEvent[] = [
    ...completedPaymentOrders.map((o) => ({
      createdAt: toDate(o.createdAt),
      amount: fromMinorUnits(revenueMinorExcludingDelivery(o)),
      source: String(o.paymentMethod || "") === "Bkash Manual" ? "Bkash" : "Bank",
      kind: "payment" as const,
    })),
    ...completedCodOrders.map((o) => ({
      createdAt: toDate(o.createdAt),
      amount: fromMinorUnits(codRevenueMinorForOrder(o)),
      source: "COD",
      kind: "payment" as const,
    })),
    ...completedRevenueWithdrawals.map((w) => ({
      createdAt: toDate(w.completedAt || w.updatedAt || w.createdAt),
      amount: -Number(w.amount || 0),
      source: String(w.paymentSource || ""),
      kind: "withdrawal" as const,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const latestRevenueEvent = revenueEvents[0] || null;
  // Full totals received via each payment method (including delivery fee, since customer pays full amount)
  const bkashTotalReceivedMinor = completedPaymentOrders
    .filter((o) => String(o.paymentMethod || "") === "Bkash Manual")
    .reduce((sum, o) => sum + Number(o?.financialsMinor?.totalMinor ?? toMinorUnits(o.total ?? 0)), 0);
  const bankTotalReceivedMinor = completedPaymentOrders
    .filter((o) => String(o.paymentMethod || "") === "Bank Manual")
    .reduce((sum, o) => sum + Number(o?.financialsMinor?.totalMinor ?? toMinorUnits(o.total ?? 0)), 0);
  const bkashBalance = fromMinorUnits(Math.max(0, bkashTotalReceivedMinor - bkashWithdrawnMinor));
  const bankBalance = fromMinorUnits(Math.max(0, bankTotalReceivedMinor - bankWithdrawnMinor));
  // Withdrawable balances per source (deducted by bottle owner earnings)
  const bkashWithdrawable = fromMinorUnits(Math.max(0, bkashWithdrawableMinor - bkashWithdrawnMinor));
  const bankWithdrawable = fromMinorUnits(Math.max(0, bankWithdrawableMinor - bankWithdrawnMinor));
  const codWithdrawable = fromMinorUnits(Math.max(0, codWithdrawableMinor - codWithdrawnMinor));
  // Total store revenue = only what the store actually keeps (packaging cost recovery for personal_collection)
  const storeRevenueTotalMinor = bkashWithdrawableMinor + bankWithdrawableMinor + codWithdrawableMinor;
  const storeRevenueTotal = fromMinorUnits(storeRevenueTotalMinor);
  const storeRevenueBalance = fromMinorUnits(Math.max(0, storeRevenueTotalMinor - totalRevenueWithdrawnMinor));
  const codBalance = {
    total: fromMinorUnits(Math.max(0, codPaymentsMinor)),
    withdrawn: fromMinorUnits(codWithdrawnMinor),
    balance: fromMinorUnits(Math.max(0, codPaymentsMinor - codWithdrawnMinor)),
    withdrawable: codWithdrawable,
    lastUpdatedAmount: latestCodWithdrawal ? Number(latestCodWithdrawal.amount || 0) : 0,
    lastUpdatedAt: latestCodWithdrawal ? toDate(latestCodWithdrawal.completedAt || latestCodWithdrawal.updatedAt || latestCodWithdrawal.createdAt).toISOString() : null,
    lastUpdatedSource: "COD",
    history: codWithdrawalDocs
      .sort((a, b) => toDate(b.createdAt).getTime() - toDate(a.createdAt).getTime())
      .map((w) => serializeDoc(w)),
  };

  return NextResponse.json({
    totalOrders,
    completedOrders,
    pendingOrders,
    pendingBkashVerifications,
    pendingBankVerifications,
    totalRevenue,
    totalProfit: totalProfitVal + requestProfitTotal,
    todayOrders,
    todayRevenue,
    todayProfit: todayProfitVal + requestProfitToday,
    monthRevenue,
    monthProfit: monthProfitVal + requestProfitMonth,
    requestProfit: { total: requestProfitTotal, today: requestProfitToday, month: requestProfitMonth },
    lowStockPerfumes,
    lowStockBottles,
    mostSold,
    mostRequested,
    stockRequests,
    recentOrders,
    dailySales,
    monthlySales,
    ownership: {
      crossOwner: { total: Math.round(crossOwnerTotal), today: Math.round(crossOwnerToday), month: Math.round(crossOwnerMonth) },
      Tayeb: ownershipBreakdown["Tayeb"] ?? { total: 0, today: 0, month: 0 },
      Enid: ownershipBreakdown["Enid"] ?? { total: 0, today: 0, month: 0 },
    },
    // Legacy owners field — now uses item-based recalculation instead of ledger
    owners: {
      owner1Name,
      owner2Name,
      owner1Share: settings?.owner1Share ?? 60,
      owner2Share: settings?.owner2Share ?? 40,
      totalProfit: {
        owner1: Math.round((ownershipBreakdown[owner1Name]?.total ?? 0) + (crossOwnerEarningsByOwner[owner1Name]?.total ?? 0)),
        owner2: Math.round((ownershipBreakdown[owner2Name]?.total ?? 0) + (crossOwnerEarningsByOwner[owner2Name]?.total ?? 0)),
      },
      todayProfit: {
        owner1: Math.round((ownershipBreakdown[owner1Name]?.today ?? 0) + (crossOwnerEarningsByOwner[owner1Name]?.today ?? 0)),
        owner2: Math.round((ownershipBreakdown[owner2Name]?.today ?? 0) + (crossOwnerEarningsByOwner[owner2Name]?.today ?? 0)),
      },
      monthProfit: {
        owner1: Math.round((ownershipBreakdown[owner1Name]?.month ?? 0) + (crossOwnerEarningsByOwner[owner1Name]?.month ?? 0)),
        owner2: Math.round((ownershipBreakdown[owner2Name]?.month ?? 0) + (crossOwnerEarningsByOwner[owner2Name]?.month ?? 0)),
      },
    },
    // Owner account balances (from ownerAccounts + withdrawals collections)
    ownerAccounts: (() => {
      type OwnerAccountDoc = { totalEarned?: number; storeShareEarned?: number };
      const accountsMap: Record<string, OwnerAccountDoc> = {};
      for (const doc of ownerAccountsSnap.docs) {
        accountsMap[doc.id] = doc.data() as OwnerAccountDoc;
      }
      const profitTotalsByOwner: Record<string, { totalEarned: number; storeShareEarned: number }> = {};
      for (const tx of profitTransactions) {
        const ownerName = tx.ownerName || "Unknown";
        if (!profitTotalsByOwner[ownerName]) profitTotalsByOwner[ownerName] = { totalEarned: 0, storeShareEarned: 0 };
        const amount = Number(tx.amount || 0);
        if (tx.type === "sale" || tx.type === "owner-revenue-base") {
          profitTotalsByOwner[ownerName].totalEarned += amount;
        } else if (tx.type === "cross-owner-share" || tx.type === "store-share") {
          profitTotalsByOwner[ownerName].storeShareEarned += amount;
        }
      }
        const withdrawalsByOwner: Record<string, number> = {};
      for (const doc of withdrawalsSnap.docs) {
          const w = doc.data() as { ownerName?: string; amount?: number; withdrawalType?: string; withdrawFrom?: string; status?: string };
        const owner = w.ownerName || "Unknown";
          if ((w.status ?? "Completed") !== "Completed") continue;
        if (w.withdrawFrom !== undefined && w.withdrawFrom !== "Owner's Profit") continue;
        if (w.withdrawalType !== "profit" && w.withdrawalType !== undefined) continue;
        withdrawalsByOwner[owner] = (withdrawalsByOwner[owner] || 0) + Number(w.amount || 0);
      }
      const buildBalance = (name: string, email: string) => {
        // Use item-based recalculation (correct for personal_collection)
        const totalEarned = Math.round(ownershipBreakdown[name]?.total ?? 0);
        const storeShareEarned = Math.round(crossOwnerEarningsByOwner[name]?.total ?? 0);
        const withdrawn = withdrawalsByOwner[name] || 0;
        // Available = own bottle earnings + cross-owner earnings received - withdrawn
        const profitAvailable = Math.max(0, Math.round(totalEarned + storeShareEarned - withdrawn));
        return {
          name,
          email,
          totalEarned,
          storeShareEarned,
          totalWithdrawn: Math.round(withdrawn),
          profitAvailable,
          availableBalance: profitAvailable,
        };
      };
      const o1 = settings?.owner1Name ?? "Tayeb";
      const o2 = settings?.owner2Name ?? "Enid";
      const e1 = settings?.owner1Email ?? "";
      const e2 = settings?.owner2Email ?? "";
      return [buildBalance(o1, e1), buildBalance(o2, e2)];
    })(),
    storeRevenue: {
      total: storeRevenueTotal,
      withdrawn: fromMinorUnits(totalRevenueWithdrawnMinor),
      balance: storeRevenueBalance,
      bkashBalance,
      bankBalance,
      bkashWithdrawable,
      bankWithdrawable,
      lastUpdatedAmount: latestRevenueEvent ? Math.abs(latestRevenueEvent.amount) : 0,
      lastUpdatedAt: latestRevenueEvent ? latestRevenueEvent.createdAt.toISOString() : null,
      lastUpdatedSource: latestRevenueEvent?.source || null,
      history: revenueWithdrawalDocs
        .sort((a, b) => toDate(b.createdAt).getTime() - toDate(a.createdAt).getTime())
        .map((w) => serializeDoc(w)),
    },
    codBalance,
  }, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
