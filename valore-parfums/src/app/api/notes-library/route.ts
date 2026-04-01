import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/auth";
import { Collections, db, serializeDoc } from "@/lib/prisma";
import { getCanonicalNotesLibrary } from "@/lib/fragrance-notes";

const NOTES_DOC_ID = "global";
const CACHE_TTL = 5 * 60_000;
const CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=600";

let notesLibraryCache: { data: unknown; ts: number } | null = null;

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
  if (notesLibraryCache && Date.now() - notesLibraryCache.ts < CACHE_TTL) {
    return notesLibraryCache.data;
  }

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
    const data = serializeDoc({ ...canonical, createdAt: now, updatedAt: now });
    notesLibraryCache = { data, ts: Date.now() };
    return data;
  }

  const currentData = snap.data() || {};
  const hasCanonicalSchema = Array.isArray(currentData.categories) && Array.isArray(currentData.notes);
  const currentVersion = Number(currentData.version || 0);
  const isStale = !hasCanonicalSchema || currentVersion < canonical.version;

  if (isStale) {
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
    const serializedData = serializeDoc({ ...canonical, updatedAt: now });
    notesLibraryCache = { data: serializedData, ts: Date.now() };
    return serializedData;
  }

  const serializedData = serializeDoc({
    version: Number(currentData.version || canonical.version),
    categories: currentData.categories,
    notes: currentData.notes,
    noteLabels: Array.isArray(currentData.noteLabels) ? currentData.noteLabels : canonical.noteLabels,
    updatedAt: currentData.updatedAt || currentData.createdAt || null,
  });
  notesLibraryCache = { data: serializedData, ts: Date.now() };
  return serializedData;
}

export async function GET() {
  const data = await getLibraryDoc();
  return NextResponse.json(data, { headers: { "Cache-Control": CACHE_CONTROL } });
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
    const serializedData = serializeDoc({ ...canonical, updatedAt: now });
    notesLibraryCache = { data: serializedData, ts: Date.now() };
    return NextResponse.json(serializedData, { headers: { "Cache-Control": CACHE_CONTROL } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update notes library";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
