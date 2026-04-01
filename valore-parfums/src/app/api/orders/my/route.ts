import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { normalizeOrderImagePath } from "@/lib/utils";
import { FieldPath } from "firebase-admin/firestore";

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

  const missingImagePerfumeIds = new Set<string>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ordersWithItems: any[] = await Promise.all(
    orderDocs.map(async (doc) => {
      const itemsSnap = await db.collection(Collections.orders).doc(doc.id).collection("items").get();
      const items = itemsSnap.docs.map((itemDoc) => {
        const itemData = itemDoc.data();
        const perfumeImage = normalizeOrderImagePath(itemData.perfumeImage);
        const perfumeId = typeof itemData.perfumeId === "string" ? itemData.perfumeId.trim() : "";

        if (!perfumeImage && perfumeId) {
          missingImagePerfumeIds.add(perfumeId);
        }

        return {
          id: itemDoc.id,
          ...itemData,
          perfumeImage,
        };
      });
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

  const perfumeImageById = new Map<string, string>();
  if (missingImagePerfumeIds.size > 0) {
    const perfumeIds = [...missingImagePerfumeIds];
    const chunkSize = 10;

    for (let i = 0; i < perfumeIds.length; i += chunkSize) {
      const chunk = perfumeIds.slice(i, i + chunkSize);
      const perfumesSnap = await db
        .collection(Collections.perfumes)
        .where(FieldPath.documentId(), "in", chunk)
        .get();

      for (const perfumeDoc of perfumesSnap.docs) {
        if (!perfumeDoc.exists) continue;
        const perfume = perfumeDoc.data() as { images?: string };
        if (!perfume) continue;

        const images: string[] = (() => {
          try {
            return JSON.parse(perfume.images || "[]");
          } catch {
            return [];
          }
        })();

        const fallbackImage = normalizeOrderImagePath(images[0]);
        if (fallbackImage) {
          perfumeImageById.set(perfumeDoc.id, fallbackImage);
        }
      }
    }
  }

  for (const order of ordersWithItems) {
    order.items = (order.items || []).map((item: { perfumeId?: string; perfumeImage?: string }) => {
      if (item.perfumeImage) return item;
      return {
        ...item,
        perfumeImage: perfumeImageById.get(item.perfumeId || "") || "",
      };
    });
  }

  ordersWithItems.sort((a, b) => {
    const da = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
    const db2 = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
    return db2.getTime() - da.getTime();
  });

  return NextResponse.json(serializeDoc(ordersWithItems));
}
