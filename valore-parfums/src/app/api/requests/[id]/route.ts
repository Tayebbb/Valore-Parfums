import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// PUT update request status — admin only
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const docRef = db.collection(Collections.requests).doc(id);
  const existing = await docRef.get();
  if (!existing.exists) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if (body.status) updates.status = String(body.status);
  if (body.adminNote !== undefined) updates.adminNote = String(body.adminNote).slice(0, 500);

  await docRef.update(updates);
  const doc = await docRef.get();
  return NextResponse.json(serializeDoc({ id, ...doc.data() }));
}
