import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { Timestamp } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/auth";

// PUT update bottle — admin only
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  await db.collection(Collections.bottles).doc(id).update({ ...body, updatedAt: Timestamp.now() });
  const doc = await db.collection(Collections.bottles).doc(id).get();
  return NextResponse.json(serializeDoc({ id, ...doc.data() }));
}

// DELETE bottle — admin only
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await db.collection(Collections.bottles).doc(id).delete();
  return NextResponse.json({ success: true });
}
