import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { v4 as uuid } from "uuid";
import { Timestamp } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/auth";

// GET all perfumes (replaces prisma.perfume.findMany)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const active = searchParams.get("active");

  // Fetch all then filter/sort in memory to avoid Firestore composite index requirement
  const snap = await db.collection(Collections.perfumes).get();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let perfumes: any[] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (active === "true") {
    perfumes = perfumes.filter((p) => p.isActive === true);
  }
  perfumes.sort((a, b) => {
    const da = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
    const db2 = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
    return db2.getTime() - da.getTime();
  });
  return NextResponse.json(perfumes.map(serializeDoc));
}

// CREATE perfume — admin only
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const id = uuid();
    const now = Timestamp.now();
    const data = { ...body, createdAt: now, updatedAt: now };
    await db.collection(Collections.perfumes).doc(id).set(data);
    return NextResponse.json(serializeDoc({ id, ...data }), { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create perfume";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
