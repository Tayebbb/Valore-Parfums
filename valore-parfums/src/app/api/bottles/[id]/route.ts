import { NextResponse } from "next/server";
// Updated: replaced Prisma with Firestore Admin SDK
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { Timestamp } from "firebase-admin/firestore";

// PUT update bottle — Firestore doc update (replaces prisma.bottleInventory.update)
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  await db.collection(Collections.bottles).doc(id).update({ ...body, updatedAt: Timestamp.now() });
  const doc = await db.collection(Collections.bottles).doc(id).get();
  return NextResponse.json(serializeDoc({ id, ...doc.data() }));
}

// DELETE bottle — Firestore doc delete (replaces prisma.bottleInventory.delete)
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.collection(Collections.bottles).doc(id).delete();
  return NextResponse.json({ success: true });
}
