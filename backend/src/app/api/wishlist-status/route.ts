import { NextResponse } from "next/server";
import { db, Collections } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

// GET /api/wishlist-status?perfumeId=xxx — check if specific perfume is wishlisted
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ wishlisted: false });

  try {
    const { searchParams } = new URL(req.url);
    const perfumeId = searchParams.get("perfumeId");

    if (!perfumeId || typeof perfumeId !== "string") {
      return NextResponse.json({ error: "perfumeId required" }, { status: 400 });
    }

    // Quick lookup: fetch only the first matching document
    const snap = await db.collection(Collections.wishlists)
      .where("userId", "==", user.id)
      .where("perfumeId", "==", perfumeId)
      .limit(1)
      .get();

    const wishlisted = !snap.empty;
    return NextResponse.json({ wishlisted }, {
      headers: {
        "Cache-Control": "private, max-age=10, stale-while-revalidate=30",
      },
    });
  } catch {
    return NextResponse.json({ wishlisted: false });
  }
}
