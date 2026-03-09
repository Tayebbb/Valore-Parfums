import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// PUT update decant size — admin only
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  await db.collection(Collections.decantSizes).doc(id).update(body);
  const doc = await db.collection(Collections.decantSizes).doc(id).get();
  return NextResponse.json(serializeDoc({ id, ...doc.data() }));
}

// DELETE decant size — admin only
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await db.collection(Collections.decantSizes).doc(id).delete();
  return NextResponse.json({ success: true });
}
