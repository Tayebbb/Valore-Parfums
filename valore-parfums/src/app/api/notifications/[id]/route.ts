import { NextResponse } from "next/server";
// Updated: replaced Prisma with Firestore Admin SDK
import { db, Collections, serializeDoc } from "@/lib/prisma";

// PUT — update notification (replaces prisma.notification.update)
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

// DELETE — remove notification (replaces prisma.notification.delete)
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await db.collection(Collections.notifications).doc(id).delete();
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete notification" }, { status: 500 });
  }
}
