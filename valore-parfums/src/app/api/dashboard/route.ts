import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

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
  const [ordersSnap, perfumesSnap, bottlesSnap, stockRequestsSnap, settingsDoc, allItemsSnap, ownerAccountsSnap, withdrawalsSnap, fulfilledRequestsSnap] = await Promise.all([
    db.collection(Collections.orders).get(),
    db.collection(Collections.perfumes).orderBy("totalStockMl", "asc").get(),
    db.collection(Collections.bottles).orderBy("availableCount", "asc").get(),
    db.collection(Collections.stockRequests).get(),
    db.collection(Collections.settings).doc("default").get(),
    db.collectionGroup("items").get(),
    db.collection(Collections.ownerAccounts).get(),
    db.collection(Collections.withdrawals).get(),
    db.collection(Collections.requests).where("status", "==", "Fulfilled").get(),
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

  const normalizeOrderStatus = (status?: string) => {
    if (!status) return "Pending";
    if (status === "Completed") return "Dispatched";
    if (status === "Approved") return "Confirmed";
    if (status === "Fulfilled") return "Dispatched";
    if (status === "Declined") return "Cancelled";
    return status;
  };

  // Aggregates (replaces prisma.order.count, prisma.order.aggregate)
  const normalizedOrders = allOrders.map((order) => ({ ...order, normalizedStatus: normalizeOrderStatus(order.status) }));
  const totalOrders = normalizedOrders.length;
  const completedOrders = normalizedOrders.filter((o) => o.normalizedStatus === "Dispatched").length;
  const pendingOrders = normalizedOrders.filter((o) => ["Pending", "Confirmed", "Sourcing", "Ready"].includes(o.normalizedStatus)).length;
  const completedOrderList = normalizedOrders.filter((o) => o.normalizedStatus === "Dispatched");
  const totalRevenue = completedOrderList.reduce((s, o) => s + (o.total ?? 0), 0);
  const totalProfitVal = completedOrderList.reduce((s, o) => s + (o.profit ?? 0), 0);

  // Today aggregates
  const todayOrdersNonCancelled = normalizedOrders.filter((o) => toDate(o.createdAt) >= startOfDay && o.normalizedStatus !== "Cancelled");
  const todayCompleted = normalizedOrders.filter((o) => toDate(o.createdAt) >= startOfDay && o.normalizedStatus === "Dispatched");
  const todayOrders = todayOrdersNonCancelled.length;
  const todayRevenue = todayCompleted.reduce((s, o) => s + (o.total ?? 0), 0);
  const todayProfitVal = todayCompleted.reduce((s, o) => s + (o.profit ?? 0), 0);

  // Month aggregates
  const monthCompleted = normalizedOrders.filter((o) => toDate(o.createdAt) >= startOfMonth && o.normalizedStatus === "Dispatched");
  const monthRevenue = monthCompleted.reduce((s, o) => s + (o.total ?? 0), 0);
  const monthProfitVal = monthCompleted.reduce((s, o) => s + (o.profit ?? 0), 0);

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
    .slice(0, 5);

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
      revenue: dayCompleted.reduce((s, o) => s + (o.total ?? 0), 0),
      profit: dayCompleted.reduce((s, o) => s + (o.profit ?? 0), 0),
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
      revenue: mCompleted.reduce((s, o) => s + (o.total ?? 0), 0),
      profit: mCompleted.reduce((s, o) => s + (o.profit ?? 0), 0),
      orders: mCompleted.length,
    });
  }

  // Ownership profit breakdown from actual order items (replaces prisma.orderItem.findMany with order include)
  const completedItems = allItems.filter((i) => normalizeOrderStatus(i.orderStatus) === "Dispatched");
  const ownershipBreakdown: Record<string, { total: number; today: number; month: number }> = {};
  let crossOwnerTotal = 0, crossOwnerToday = 0, crossOwnerMonth = 0;

  for (const item of completedItems) {
    const name = item.ownerName || "Store";
    if (!ownershipBreakdown[name]) ownershipBreakdown[name] = { total: 0, today: 0, month: 0 };
    ownershipBreakdown[name].total += item.ownerProfit ?? 0;
    crossOwnerTotal += item.otherOwnerProfit ?? 0;
    const createdAt = toDate(item.orderCreatedAt);
    if (createdAt >= startOfDay) {
      ownershipBreakdown[name].today += item.ownerProfit ?? 0;
      crossOwnerToday += item.otherOwnerProfit ?? 0;
    }
    if (createdAt >= startOfMonth) {
      ownershipBreakdown[name].month += item.ownerProfit ?? 0;
      crossOwnerMonth += item.otherOwnerProfit ?? 0;
    }
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

  return NextResponse.json({
    totalOrders,
    completedOrders,
    pendingOrders,
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
    // Legacy owners field for backward compat
    owners: {
      owner1Name: settings?.owner1Name ?? "Tayeb",
      owner2Name: settings?.owner2Name ?? "Enid",
      owner1Share: settings?.owner1Share ?? 60,
      owner2Share: settings?.owner2Share ?? 40,
      totalProfit: {
        owner1: Math.round(ownershipBreakdown["Tayeb"]?.total ?? 0),
        owner2: Math.round(ownershipBreakdown["Enid"]?.total ?? 0),
      },
      todayProfit: {
        owner1: Math.round(ownershipBreakdown["Tayeb"]?.today ?? 0),
        owner2: Math.round(ownershipBreakdown["Enid"]?.today ?? 0),
      },
      monthProfit: {
        owner1: Math.round(ownershipBreakdown["Tayeb"]?.month ?? 0),
        owner2: Math.round(ownershipBreakdown["Enid"]?.month ?? 0),
      },
    },
    // Owner account balances (from ownerAccounts + withdrawals collections)
    ownerAccounts: (() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const accountsMap: Record<string, any> = {};
      for (const doc of ownerAccountsSnap.docs) {
        accountsMap[doc.id] = doc.data();
      }
      const withdrawalsByOwner: Record<string, number> = {};
      for (const doc of withdrawalsSnap.docs) {
        const w = doc.data();
        const owner = w.ownerName || "Unknown";
        withdrawalsByOwner[owner] = (withdrawalsByOwner[owner] || 0) + (w.amount || 0);
      }
      const buildBalance = (name: string, email: string) => {
        const acct = accountsMap[name] || { totalEarned: 0, storeShareEarned: 0 };
        const earned = (acct.totalEarned || 0) + (acct.storeShareEarned || 0);
        const withdrawn = withdrawalsByOwner[name] || 0;
        return {
          name,
          email,
          totalEarned: Math.round(acct.totalEarned || 0),
          storeShareEarned: Math.round(acct.storeShareEarned || 0),
          totalWithdrawn: Math.round(withdrawn),
          availableBalance: Math.round(earned - withdrawn),
        };
      };
      const o1 = settings?.owner1Name ?? "Tayeb";
      const o2 = settings?.owner2Name ?? "Enid";
      const e1 = settings?.owner1Email ?? "";
      const e2 = settings?.owner2Email ?? "";
      return [buildBalance(o1, e1), buildBalance(o2, e2)];
    })(),
  });
}
