import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// PUT — update notification — admin only
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const body = await req.json();
    await db.collection(Collections.notifications).doc(id).update({
      message: body.message,
      isActive: body.isActive,
      sortOrder: body.sortOrder,
    });
    const doc = await db.collection(Collections.notifications).doc(id).get();
    return NextResponse.json(serializeDoc({ id, ...doc.data() }));
  } catch {
    return NextResponse.json({ error: "Failed to update notification" }, { status: 500 });
  }
}

// DELETE — remove notification — admin only
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    await db.collection(Collections.notifications).doc(id).delete();
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete notification" }, { status: 500 });
  }
}
