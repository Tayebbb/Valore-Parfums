import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

// GET /api/orders/my - returns orders for the authenticated user only
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [byUserIdSnap, byEmailSnap] = await Promise.all([
    db.collection(Collections.orders).where("userId", "==", user.id).get(),
    db.collection(Collections.orders).where("customerEmail", "==", user.email).get(),
  ]);

  const orderDocsMap = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  for (const doc of byUserIdSnap.docs) {
    orderDocsMap.set(doc.id, doc);
  }
  for (const doc of byEmailSnap.docs) {
    orderDocsMap.set(doc.id, doc);
  }

  const orderDocs = Array.from(orderDocsMap.values());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ordersWithItems: any[] = await Promise.all(
    orderDocs.map(async (doc) => {
      const itemsSnap = await db.collection(Collections.orders).doc(doc.id).collection("items").get();
      const items = itemsSnap.docs.map((itemDoc) => ({ id: itemDoc.id, ...itemDoc.data() }));
      const data = doc.data();

      return {
        id: doc.id,
        ...data,
        status: data.status || "Pending",
        totalAmount: data.totalAmount ?? data.subtotal ?? 0,
        finalAmount: data.finalAmount ?? data.total ?? 0,
        items,
      };
    }),
  );

  ordersWithItems.sort((a, b) => {
    const da = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
    const db2 = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
    return db2.getTime() - da.getTime();
  });

  return NextResponse.json(serializeDoc(ordersWithItems));
}
