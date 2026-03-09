import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { v4 as uuid } from "uuid";
import { Timestamp } from "firebase-admin/firestore";
import { getSessionUser } from "@/lib/auth";

// GET /api/wishlist — get user's wishlist
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json([]);

  try {
    const snap = await db.collection(Collections.wishlists)
      .where("userId", "==", user.id)
      .orderBy("createdAt", "desc")
      .get();

    const items = [];
    for (const doc of snap.docs) {
      const data = doc.data();
      const perfumeDoc = await db.collection(Collections.perfumes).doc(data.perfumeId).get();
      items.push(serializeDoc({
        id: doc.id,
        ...data,
        perfume: perfumeDoc.exists ? { id: perfumeDoc.id, ...perfumeDoc.data() } : null,
      }));
    }
    return NextResponse.json(items);
  } catch {
    return NextResponse.json([]);
  }
}

// POST /api/wishlist — toggle wishlist item
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Login required" }, { status: 401 });
  }

  try {
    const { perfumeId } = await req.json();

    if (!perfumeId || typeof perfumeId !== "string") {
      return NextResponse.json({ error: "perfumeId required" }, { status: 400 });
    }

    const existingSnap = await db.collection(Collections.wishlists)
      .where("userId", "==", user.id)
      .where("perfumeId", "==", perfumeId)
      .limit(1)
      .get();

    if (!existingSnap.empty) {
      await db.collection(Collections.wishlists).doc(existingSnap.docs[0].id).delete();
      return NextResponse.json({ action: "removed" });
    } else {
      const id = uuid();
      await db.collection(Collections.wishlists).doc(id).set({
        userId: user.id,
        perfumeId,
        createdAt: Timestamp.now(),
      });
      return NextResponse.json({ action: "added" });
    }
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
