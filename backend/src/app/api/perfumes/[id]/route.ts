import { NextResponse } from "next/server";
import { db, Collections } from "@/lib/prisma";
import { Timestamp } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/auth";
import { buildStructuredNotes } from "@/lib/fragrance-notes";
import { getBrandTier } from "@/lib/utils";
import {
  buildCanonicalProductPath,
  buildCanonicalProductUrl,
  getProductKeywordBundle,
  resolveBrandSlug,
  resolvePerfumeSlug,
  serializePerfumeForApi,
} from "@/lib/seo-catalog";

// GET single perfume (replaces prisma.perfume.findUnique)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await db.collection(Collections.perfumes).doc(id).get();
  if (!doc.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(serializePerfumeForApi({ id: doc.id, ...(doc.data() || {}) }));
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

    if (body.purchasePricePerMl !== undefined) {
      const purchasePricePerMl = Number(body.purchasePricePerMl || 0);
      updatePayload.purchasePricePerMl = purchasePricePerMl;
      updatePayload.costPricePerMl = purchasePricePerMl;
    }
    if (body.marketPricePerMl !== undefined || body.totalStockMl !== undefined) {
      const marketPricePerMl = Number(body.marketPricePerMl ?? 0);
      const totalStockMl = Number(body.totalStockMl ?? 0);
      const bottleSizeForTier = Math.max(1, totalStockMl || 100);
      updatePayload.pricingTier = getBrandTier(marketPricePerMl * bottleSizeForTier);
    }

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

    if (body.name !== undefined || body.brand !== undefined) {
      const currentDoc = await db.collection(Collections.perfumes).doc(id).get();
      const current = currentDoc.data() || {};
      const name = String(body.name ?? current.name ?? "");
      const brand = String(body.brand ?? current.brand ?? "");
      const slug = resolvePerfumeSlug({ name, slug: String(body.slug ?? current.slug ?? "") });
      const brandSlug = resolveBrandSlug({ brand, brandSlug: String(body.brandSlug ?? current.brandSlug ?? "") });

      updatePayload.slug = slug;
      updatePayload.brandSlug = brandSlug;
      updatePayload.seoKeywords = getProductKeywordBundle(name || "perfume");
      updatePayload.canonicalPath = buildCanonicalProductPath({ name, brand, slug, brandSlug });
      updatePayload.canonicalUrl = buildCanonicalProductUrl({ name, brand, slug, brandSlug });
    }

    await db.collection(Collections.perfumes).doc(id).update(updatePayload);
    const doc = await db.collection(Collections.perfumes).doc(id).get();
    return NextResponse.json(serializePerfumeForApi({ id, ...(doc.data() || {}) }));
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
