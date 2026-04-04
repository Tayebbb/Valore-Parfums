import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { v4 as uuid } from "uuid";
import { Timestamp } from "firebase-admin/firestore";
import { requireAdmin, getSessionUser } from "@/lib/auth";
import { buildOrderPricingSnapshot } from "@/lib/finance";

// GET requests
// Admin: returns all requests
// Logged-in user: returns only their requests
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const allParam = searchParams.get("all");

  // Admin fetching all requests
  if (allParam === "true") {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const snap = await db.collection(Collections.requests).orderBy("createdAt", "desc").get();
    const requests = snap.docs.map((doc) => serializeDoc({ id: doc.id, ...doc.data() }));
    return NextResponse.json(requests);
  }

  // User fetching their own requests
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  // Query by multiple identifiers to support legacy records and avoid
  // requiring a composite index for where+orderBy.
  const requestsRef = db.collection(Collections.requests);
  const queries = [
    requestsRef.where("userId", "==", user.id).get(),
  ];
  if (user.email) {
    queries.push(requestsRef.where("userEmail", "==", user.email).get());
    queries.push(requestsRef.where("customerEmail", "==", user.email).get());
  }

  const snapshots = await Promise.all(queries);
  const merged = new Map<string, Record<string, unknown>>();

  for (const snap of snapshots) {
    for (const doc of snap.docs) {
      merged.set(doc.id, { id: doc.id, ...doc.data() });
    }
  }

  const getCreatedAtTime = (value: unknown) => {
    if (value && typeof value === "object" && "toDate" in value) {
      const date = (value as { toDate?: () => Date }).toDate?.();
      return date ? date.getTime() : 0;
    }
    const parsed = new Date(String(value || "")).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const requests = Array.from(merged.values())
    .sort((a, b) => getCreatedAtTime(b.createdAt) - getCreatedAtTime(a.createdAt))
    .map((row) => serializeDoc(row));

  return NextResponse.json(requests);
}

// POST create a request — logged-in users
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const body = await req.json();
  const { perfumeName, brand, type, ml, fullBottleSize, quantity, notes } = body;

  if (!perfumeName || !type) {
    return NextResponse.json({ error: "Perfume name and type are required" }, { status: 400 });
  }

  if (!["decant", "full_bottle"].includes(type)) {
    return NextResponse.json({ error: "Type must be 'decant' or 'full_bottle'" }, { status: 400 });
  }

  if (type === "decant" && (!ml || ml <= 0)) {
    return NextResponse.json({ error: "ML is required for decant requests" }, { status: 400 });
  }
  if (type === "full_bottle" && !String(fullBottleSize || "").trim()) {
    return NextResponse.json({ error: "Desired bottle size is required for full bottle requests" }, { status: 400 });
  }

  const id = uuid();
  const now = Timestamp.now();
  const data = {
    entryType: "request",
    perfumeName: String(perfumeName).slice(0, 200),
    brand: String(brand || "").slice(0, 100),
    type, // "decant" | "full_bottle"
    ml: type === "decant" ? Number(ml) : null,
    fullBottleSize: type === "full_bottle" ? String(fullBottleSize).slice(0, 100) : null,
    quantity: Math.max(1, Math.min(Number(quantity) || 1, 50)),
    notes: String(notes || "").slice(0, 500),
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    status: "Pending",
    createdAt: now,
  };

  const orderStatus = type === "full_bottle" ? "Sourcing" : "Pending";
  const pricingSnapshot = buildOrderPricingSnapshot({
    subtotalMinor: 0,
    discountMinor: 0,
    deliveryFeeMinor: 0,
    totalCostMinor: 0,
  });
  const orderData = {
    entryType: "request",
    customerName: user.name,
    customerPhone: "",
    customerEmail: user.email,
    userId: user.id,
    isGuestOrder: false,
    pickupMethod: "Pickup",
    status: orderStatus,
    orderSource: "customer_request",
    requestType: type,
    requestId: id,
    perfumeName: data.perfumeName,
    brand: data.brand,
    notes: data.notes,
    subtotal: 0,
    total: 0,
    profit: 0,
    discount: 0,
    pricingSnapshot,
    financialsMinor: {
      subtotalMinor: pricingSnapshot.subtotalMinor,
      discountMinor: pricingSnapshot.discountMinor,
      deliveryFeeMinor: pricingSnapshot.deliveryFeeMinor,
      totalMinor: pricingSnapshot.totalMinor,
      totalCostMinor: pricingSnapshot.totalCostMinor,
      totalProfitMinor: pricingSnapshot.totalProfitMinor,
    },
    profitDistribution: [],
    financialsLocked: false,
    createdAt: now,
    updatedAt: now,
  };

  const orderItemId = uuid();
  await Promise.all([
    db.collection(Collections.requests).doc(id).set(data),
    db.collection(Collections.orders).doc(id).set(orderData),
    db.collection(Collections.orders).doc(id).collection("items").doc(orderItemId).set({
      perfumeId: "",
      perfumeName: data.perfumeName,
      ml: data.ml ?? 0,
      isFullBottle: type === "full_bottle",
      fullBottleSize: type === "full_bottle" ? data.fullBottleSize : undefined,
      quantity: data.quantity,
      unitPrice: 0,
      totalPrice: 0,
      costPrice: 0,
      ownerName: "Store",
      ownerProfit: 0,
      otherOwnerProfit: 0,
      financialBreakdown: {
        unitCostMinor: 0,
        unitSellingPriceMinor: 0,
        quantity: data.quantity,
        totalCostMinor: 0,
        totalRevenueMinor: 0,
        computedProfitMinor: 0,
      },
      createdAt: now,
      updatedAt: now,
    }),
  ]);
  return NextResponse.json(serializeDoc({ id, ...data }), { status: 201 });
}
