import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { Timestamp } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/auth";

// GET single perfume (replaces prisma.perfume.findUnique)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await db.collection(Collections.perfumes).doc(id).get();
  if (!doc.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(serializeDoc({ id: doc.id, ...doc.data() }));
}

// PUT update perfume — admin only
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const body = await req.json();
    await db.collection(Collections.perfumes).doc(id).update({ ...body, updatedAt: Timestamp.now() });
    const doc = await db.collection(Collections.perfumes).doc(id).get();
    return NextResponse.json(serializeDoc({ id, ...doc.data() }));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update perfume";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE perfume — admin only
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await db.collection(Collections.perfumes).doc(id).delete();
  return NextResponse.json({ success: true });
}
