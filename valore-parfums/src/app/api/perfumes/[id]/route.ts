import { NextResponse } from "next/server";
// Updated: replaced Prisma with Firestore Admin SDK
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { Timestamp } from "firebase-admin/firestore";

// GET single perfume (replaces prisma.perfume.findUnique)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await db.collection(Collections.perfumes).doc(id).get();
  if (!doc.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(serializeDoc({ id: doc.id, ...doc.data() }));
}

// PUT update perfume (replaces prisma.perfume.update)
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

// DELETE perfume (replaces prisma.perfume.delete)
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.collection(Collections.perfumes).doc(id).delete();
  return NextResponse.json({ success: true });
}
