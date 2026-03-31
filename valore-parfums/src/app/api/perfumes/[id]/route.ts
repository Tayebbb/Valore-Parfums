import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { Timestamp } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/auth";
import { buildStructuredNotes } from "@/lib/fragrance-notes";

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
    const updatePayload = {
      ...body,
      updatedAt: Timestamp.now(),
    } as Record<string, unknown>;

    if (body.fragranceNotes || body.fragranceNoteIds || body.topNoteIds || body.middleNoteIds || body.baseNoteIds || body.topNotes || body.middleNotes || body.baseNotes) {
      const notes = buildStructuredNotes(body);
      updatePayload.fragranceNoteIds = notes.fragranceNoteIds;
      updatePayload.fragranceNotes = notes.fragranceNotes;
      updatePayload.topNoteIds = notes.fragranceNoteIds.top;
      updatePayload.middleNoteIds = notes.fragranceNoteIds.middle;
      updatePayload.baseNoteIds = notes.fragranceNoteIds.base;
      updatePayload.topNotes = notes.fragranceNotes.top;
      updatePayload.middleNotes = notes.fragranceNotes.middle;
      updatePayload.baseNotes = notes.fragranceNotes.base;
      updatePayload.keyNotes = notes.keyNotes;
      updatePayload.noteSearchIndex = notes.noteSearchIndex;
      updatePayload.noteIdIndex = notes.noteIdIndex;
    }

    await db.collection(Collections.perfumes).doc(id).update(updatePayload);
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
