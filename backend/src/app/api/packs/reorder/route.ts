import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { db, Collections } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { invalidatePackCaches } from "@/lib/api-cache";

// POST { ids: string[] } — rewrite sortOrder to match the given order. Admin only.
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const ids: unknown = body?.ids;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 200 || ids.some((id) => typeof id !== "string" || !id)) {
    return NextResponse.json({ error: "ids must be a non-empty array of pack ids" }, { status: 400 });
  }
  if (new Set(ids).size !== ids.length) {
    return NextResponse.json({ error: "ids must be unique" }, { status: 400 });
  }

  const refs = (ids as string[]).map((id) => db.collection(Collections.packs).doc(id));
  const docs = await db.getAll(...refs);
  if (docs.some((d) => !d.exists)) {
    return NextResponse.json({ error: "One or more packs do not exist" }, { status: 400 });
  }

  const now = Timestamp.now();
  const batch = db.batch();
  refs.forEach((ref, index) => batch.update(ref, { sortOrder: index, updatedAt: now }));
  await batch.commit();
  invalidatePackCaches();
  return NextResponse.json({ success: true });
}
