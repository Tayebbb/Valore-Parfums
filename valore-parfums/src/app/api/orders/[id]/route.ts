import { NextResponse } from "next/server";
// Updated: replaced Prisma with Firestore Admin SDK
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

// GET single order by ID (replaces prisma.order.findUnique with include: items)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await db.collection(Collections.orders).doc(id).get();
  if (!doc.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Fetch subcollection items (replaces Prisma include: { items: true })
  const itemsSnap = await db.collection(Collections.orders).doc(id).collection("items").get();
  const items = itemsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const data = doc.data()!;
  return NextResponse.json(serializeDoc({
    id: doc.id,
    ...data,
    status: data.status || "Pending",
    totalAmount: data.totalAmount ?? data.subtotal ?? 0,
    finalAmount: data.finalAmount ?? data.total ?? 0,
    items,
  }));
}

// PUT update order (replaces prisma.order.update, handles cancel-restore-stock)
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  // If cancelling, restore stock (replaces Prisma increment)
  if (body.status === "Cancelled") {
    const orderDoc = await db.collection(Collections.orders).doc(id).get();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const order = orderDoc.exists ? (orderDoc.data() as any) : null;
    if (order && order.status !== "Cancelled") {
      const itemsSnap = await db.collection(Collections.orders).doc(id).collection("items").get();
      for (const itemDoc of itemsSnap.docs) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const item = itemDoc.data() as any;
        // Restore perfume stock (replaces prisma.perfume.update with increment)
        await db.collection(Collections.perfumes).doc(item.perfumeId).update({
          totalStockMl: FieldValue.increment(item.ml * item.quantity),
        });
        // Restore bottle count (replaces prisma.bottleInventory.update with increment)
        const bottleSnap = await db.collection(Collections.bottles).where("ml", "==", item.ml).limit(1).get();
        if (!bottleSnap.empty) {
          await db.collection(Collections.bottles).doc(bottleSnap.docs[0].id).update({
            availableCount: FieldValue.increment(item.quantity),
          });
        }
      }
    }
  }

  // Update order document (replaces prisma.order.update)
  await db.collection(Collections.orders).doc(id).update({
    ...body,
    updatedAt: Timestamp.now(),
  });

  // Return updated order with items
  const updatedDoc = await db.collection(Collections.orders).doc(id).get();
  const itemsSnap = await db.collection(Collections.orders).doc(id).collection("items").get();
  const items = itemsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const updatedData = updatedDoc.data()!;
  return NextResponse.json(serializeDoc({
    id: updatedDoc.id,
    ...updatedData,
    status: updatedData.status || "Pending",
    totalAmount: updatedData.totalAmount ?? updatedData.subtotal ?? 0,
    finalAmount: updatedData.finalAmount ?? updatedData.total ?? 0,
    items,
  }));
}
