import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// PUT update pickup location — admin only
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const docRef = db.collection(Collections.pickupLocations).doc(id);
  const existing = await docRef.get();
  if (!existing.exists) {
    return NextResponse.json({ error: "Pickup location not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = String(body.name).slice(0, 200);
  if (body.address !== undefined) updates.address = String(body.address).slice(0, 500);
  if (body.phone !== undefined) updates.phone = String(body.phone).slice(0, 20);
  if (body.notes !== undefined) updates.notes = String(body.notes).slice(0, 500);
  if (body.active !== undefined) updates.active = Boolean(body.active);

  const { Timestamp } = await import("firebase-admin/firestore");
  updates.updatedAt = Timestamp.now();

  await docRef.update(updates);
  const doc = await docRef.get();
  return NextResponse.json(serializeDoc({ id, ...doc.data() }));
}

// DELETE pickup location — admin only
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const docRef = db.collection(Collections.pickupLocations).doc(id);
  const existing = await docRef.get();
  if (!existing.exists) {
    return NextResponse.json({ error: "Pickup location not found" }, { status: 404 });
  }

  await docRef.delete();
  return NextResponse.json({ success: true });
}
