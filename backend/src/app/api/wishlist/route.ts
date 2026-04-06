import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { v4 as uuid } from "uuid";
import { Timestamp } from "firebase-admin/firestore";
import { getSessionUser } from "@/lib/auth";

// GET /api/wishlist — get user's wishlist
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ items: [] });

  try {
    const snap = await db.collection(Collections.wishlists)
      .where("userId", "==", user.id)
      .get();

    const entries = snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() } as { id: string; perfumeId: string; createdAt?: Date | { toDate?: () => Date } | number | string }))
      .sort((a, b) => {
        const aTime = typeof a.createdAt === "object" && a.createdAt && "toDate" in a.createdAt && typeof a.createdAt.toDate === "function"
          ? a.createdAt.toDate().getTime()
          : new Date((a.createdAt as string | number | Date | undefined) || 0).getTime();
        const bTime = typeof b.createdAt === "object" && b.createdAt && "toDate" in b.createdAt && typeof b.createdAt.toDate === "function"
          ? b.createdAt.toDate().getTime()
          : new Date((b.createdAt as string | number | Date | undefined) || 0).getTime();
        return bTime - aTime;
      });

    const items = [];
    for (const entry of entries) {
      const perfumeDoc = await db.collection(Collections.perfumes).doc(entry.perfumeId).get();
      items.push(serializeDoc({
        ...entry,
        perfume: perfumeDoc.exists ? { id: perfumeDoc.id, ...perfumeDoc.data() } : null,
      }));
    }
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: [] });
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
