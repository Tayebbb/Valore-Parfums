import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { v4 as uuid } from "uuid";
import { Timestamp } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/auth";

// GET all stock requests — admin only
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch stock requests and all perfumes in parallel (avoids N+1)
  const [snap, perfumesSnap] = await Promise.all([
    db.collection(Collections.stockRequests).orderBy("createdAt", "desc").get(),
    db.collection(Collections.perfumes).get(),
  ]);

  // Build perfume lookup map
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const perfumeMap = new Map<string, any>();
  for (const doc of perfumesSnap.docs) {
    perfumeMap.set(doc.id, { id: doc.id, ...doc.data() });
  }

  const requests = snap.docs.map((doc) => {
    const data = doc.data();
    const perfume = perfumeMap.get(data.perfumeId) || null;
    return serializeDoc({ id: doc.id, ...data, perfume });
  });
  return NextResponse.json(requests);
}

// POST create stock request (replaces prisma.stockRequest.create)
export async function POST(req: Request) {
  const body = await req.json();
  // Fetch perfume name (replaces prisma.perfume.findUnique)
  const perfumeDoc = await db.collection(Collections.perfumes).doc(body.perfumeId).get();
  if (!perfumeDoc.exists) return NextResponse.json({ error: "Perfume not found" }, { status: 404 });

  const desiredMl = Number(body.desiredMl);
  if (!Number.isFinite(desiredMl) || desiredMl <= 0) {
    return NextResponse.json({ error: "desiredMl must be a positive number" }, { status: 400 });
  }
  const rawQuantity = Number(body.quantity);
  if (!Number.isFinite(rawQuantity) || rawQuantity < 1) {
    return NextResponse.json({ error: "quantity must be at least 1" }, { status: 400 });
  }
  const clampedQuantity = Math.min(Math.round(rawQuantity), 50);

  const id = uuid();
  const now = Timestamp.now();
  const data = {
    ...body,
    perfumeName: perfumeDoc.data()!.name,
    createdAt: now,
  };

  const orderData = {
    entryType: "request",
    customerName: String(body.customerName || "").slice(0, 200),
    customerPhone: String(body.customerPhone || "").slice(0, 50),
    customerEmail: String(body.customerEmail || "").slice(0, 200),
    pickupMethod: "Pickup",
    status: "Sourcing",
    orderSource: "stock_request",
    requestId: id,
    perfumeId: String(body.perfumeId || ""),
    perfumeName: data.perfumeName,
    desiredMl: desiredMl,
    quantity: clampedQuantity,
    notes: String(body.notes || "").slice(0, 500),
    subtotal: 0,
    total: 0,
    profit: 0,
    discount: 0,
    createdAt: now,
    updatedAt: now,
  };

  await Promise.all([
    db.collection(Collections.stockRequests).doc(id).set(data),
    db.collection(Collections.orders).doc(id).set(orderData),
    db.collection(Collections.orders).doc(id).collection("items").doc(uuid()).set({
      perfumeId: String(body.perfumeId || ""),
      perfumeName: data.perfumeName,
      ml: desiredMl,
      isFullBottle: false,
      fullBottleSize: null,
      quantity: clampedQuantity,
      unitPrice: 0,
      totalPrice: 0,
      costPrice: 0,
      ownerName: "Store",
      ownerProfit: 0,
      otherOwnerProfit: 0,
      createdAt: now,
      updatedAt: now,
    }),
  ]);
  return NextResponse.json(serializeDoc({ id, ...data }), { status: 201 });
}
