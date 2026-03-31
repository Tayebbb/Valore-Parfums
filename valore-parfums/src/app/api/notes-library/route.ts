import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/auth";
import { Collections, db, serializeDoc } from "@/lib/prisma";
import { getCanonicalNotesLibrary } from "@/lib/fragrance-notes";

const NOTES_DOC_ID = "global";

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)).filter((item) => item !== undefined) as T;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, stripUndefined(item)]);
    return Object.fromEntries(entries) as T;
  }
  return value;
}

async function getLibraryDoc() {
  const canonical = getCanonicalNotesLibrary();
  const ref = db.collection(Collections.notesLibrary).doc(NOTES_DOC_ID);
  const snap = await ref.get();

  if (!snap.exists) {
    const now = Timestamp.now();
    await ref.set(stripUndefined({
      version: canonical.version,
      categories: canonical.categories,
      notes: canonical.notes,
      noteLabels: canonical.noteLabels,
      createdAt: now,
      updatedAt: now,
    }));
    return serializeDoc({ ...canonical, createdAt: now, updatedAt: now });
  }

  const data = snap.data() || {};
  const hasCanonicalSchema = Array.isArray(data.categories) && Array.isArray(data.notes);
  if (!hasCanonicalSchema) {
    const now = Timestamp.now();
    await ref.set(
      stripUndefined({
        version: canonical.version,
        categories: canonical.categories,
        notes: canonical.notes,
        noteLabels: canonical.noteLabels,
        updatedAt: now,
      }),
      { merge: true },
    );
    return serializeDoc({ ...canonical, updatedAt: now });
  }

  return serializeDoc({
    version: Number(data.version || canonical.version),
    categories: data.categories,
    notes: data.notes,
    noteLabels: Array.isArray(data.noteLabels) ? data.noteLabels : canonical.noteLabels,
    updatedAt: data.updatedAt || data.createdAt || null,
  });
}

export async function GET() {
  const data = await getLibraryDoc();
  return NextResponse.json(data);
}

export async function PUT(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await req.json().catch(() => null);
    const canonical = getCanonicalNotesLibrary();

    const ref = db.collection(Collections.notesLibrary).doc(NOTES_DOC_ID);
    const now = Timestamp.now();
    await ref.set(
      stripUndefined({
        version: canonical.version,
        categories: canonical.categories,
        notes: canonical.notes,
        noteLabels: canonical.noteLabels,
        updatedAt: now,
      }),
      { merge: true },
    );
    return NextResponse.json(serializeDoc({ ...canonical, updatedAt: now }));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update notes library";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
