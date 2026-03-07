import { NextResponse } from "next/server";
// Updated: replaced Prisma with Firestore Admin SDK
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { cookies } from "next/headers";
import { v4 as uuid } from "uuid";
import { Timestamp } from "firebase-admin/firestore";

// GET /api/wishlist — get user's wishlist (replaces prisma.wishlist.findMany with include: perfume)
export async function GET() {
  const cookieStore = await cookies();
  const session = cookieStore.get("vp-session");
  if (!session?.value) return NextResponse.json([]);

  try {
    const user = JSON.parse(session.value);
    // Firestore: query wishlists by userId (replaces Prisma where + include)
    const snap = await db.collection(Collections.wishlists)
      .where("userId", "==", user.id)
      .orderBy("createdAt", "desc")
      .get();

    const items = [];
    for (const doc of snap.docs) {
      const data = doc.data();
      // Fetch related perfume (replaces Prisma include: { perfume: true })
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
// Updated: uses Firestore compound query for unique constraint (replaces Prisma @@unique)
export async function POST(req: Request) {
  const cookieStore = await cookies();
  const session = cookieStore.get("vp-session");
  if (!session?.value) {
    return NextResponse.json({ error: "Login required" }, { status: 401 });
  }

  try {
    const user = JSON.parse(session.value);
    const { perfumeId } = await req.json();

    // Check if already wishlisted (replaces prisma.wishlist.findUnique with compound key)
    const existingSnap = await db.collection(Collections.wishlists)
      .where("userId", "==", user.id)
      .where("perfumeId", "==", perfumeId)
      .limit(1)
      .get();

    if (!existingSnap.empty) {
      // Remove (replaces prisma.wishlist.delete)
      await db.collection(Collections.wishlists).doc(existingSnap.docs[0].id).delete();
      return NextResponse.json({ action: "removed" });
    } else {
      // Add (replaces prisma.wishlist.create)
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
