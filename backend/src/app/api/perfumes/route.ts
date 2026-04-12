import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { v4 as uuid } from "uuid";
import { Timestamp } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/auth";
import { buildStructuredNotes, getCanonicalNotesLibrary } from "@/lib/fragrance-notes";
import { getBrandTier } from "@/lib/utils";
import { sanitizeCloudinaryImagesField } from "@/lib/image-utils";
import {
  buildCanonicalProductPath,
  buildCanonicalProductUrl,
  getProductKeywordBundle,
  resolveBrandSlug,
  resolvePerfumeSlug,
  serializePerfumeForApi,
} from "@/lib/seo-catalog";

const PERFUMES_CACHE_TTL = 20_000;
const PERFUMES_CACHE_CONTROL = "public, s-maxage=20, stale-while-revalidate=60";
const perfumesCache = new Map<string, { data: unknown[]; ts: number }>();
const canonicalNotesLibrary = getCanonicalNotesLibrary();

function getDate(value: unknown): Date {
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  return new Date(value as string | number | Date);
}

// GET all perfumes (replaces prisma.perfume.findMany)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const active = searchParams.get("active");
  const cacheKey = active === "true" ? "active:true" : "active:all";
  const cached = perfumesCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < PERFUMES_CACHE_TTL) {
    return NextResponse.json(cached.data, { headers: { "Cache-Control": PERFUMES_CACHE_CONTROL } });
  }

  const baseQuery = active === "true"
    ? db.collection(Collections.perfumes).where("isActive", "==", true)
    : db.collection(Collections.perfumes);

  const snap = await baseQuery.get();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const perfumes: any[] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  perfumes.sort((a, b) => {
    const da = getDate(a.createdAt);
    const db2 = getDate(b.createdAt);
    return db2.getTime() - da.getTime();
  });

  const payload = perfumes.map((perfume) => {
    const hasKeyNotes = Array.isArray(perfume.keyNotes) && perfume.keyNotes.length > 0;
    const perfumeSlug = resolvePerfumeSlug(perfume);
    const brandSlug = resolveBrandSlug(perfume);
    const keywordBundle = getProductKeywordBundle(perfume.name || "perfume");

    if (active === "true") {
      return serializePerfumeForApi({
        id: perfume.id,
        name: perfume.name,
        brand: perfume.brand,
        slug: perfumeSlug,
        brandSlug,
        inspiredBy: perfume.inspiredBy,
        category: perfume.category,
        images: perfume.images,
        totalStockMl: perfume.totalStockMl,
        isBestSeller: perfume.isBestSeller,
        totalOrders: perfume.totalOrders,
        isActive: perfume.isActive,
        createdAt: perfume.createdAt,
        keyNotes: hasKeyNotes ? perfume.keyNotes : [],
        seoKeywords: keywordBundle,
        canonicalPath: buildCanonicalProductPath({ ...perfume, slug: perfumeSlug, brandSlug }),
        canonicalUrl: buildCanonicalProductUrl({ ...perfume, slug: perfumeSlug, brandSlug }),
      });
    }

    const notes = buildStructuredNotes(perfume, canonicalNotesLibrary);
    return serializePerfumeForApi({
      ...perfume,
      slug: perfumeSlug,
      brandSlug,
      keyNotes: notes.keyNotes,
      fragranceNotes: notes.fragranceNotes,
      fragranceNoteIds: notes.fragranceNoteIds,
      noteSearchIndex: notes.noteSearchIndex,
      seoKeywords: keywordBundle,
      canonicalPath: buildCanonicalProductPath({ ...perfume, slug: perfumeSlug, brandSlug }),
      canonicalUrl: buildCanonicalProductUrl({ ...perfume, slug: perfumeSlug, brandSlug }),
    });
  });
  perfumesCache.set(cacheKey, { data: payload, ts: Date.now() });
  return NextResponse.json(payload, { headers: { "Cache-Control": PERFUMES_CACHE_CONTROL } });
}

// CREATE perfume — admin only
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const sanitizedImages = sanitizeCloudinaryImagesField(body.images);
    const purchasePricePerMl = Number(body.purchasePricePerMl ?? 0);
    const marketPricePerMl = Number(body.marketPricePerMl ?? 0);
    const bottleSizeMl = Number(body.totalStockMl ?? 0);
    const normalizedBottleSizeMl = Number.isFinite(bottleSizeMl) && bottleSizeMl > 0 ? bottleSizeMl : 0;
    const bottleCost = Number(body.bottleCost ?? 0);
    const packagingCost = Number(body.packagingCost ?? 0);
    const id = uuid();
    const now = Timestamp.now();
    const notes = buildStructuredNotes(body);
    const slug = resolvePerfumeSlug({ name: String(body.name || "") });
    const brandSlug = resolveBrandSlug({ brand: String(body.brand || "") });
    const seoKeywords = getProductKeywordBundle(String(body.name || "perfume"));
    const partialDealType = ["decant", "full_bottle"].includes(String(body.partialDealType || ""))
      ? String(body.partialDealType)
      : "";
    const partialSellingPrice = Number(body.partialSellingPrice ?? body.partialSellingPricePerMl ?? 0);

    const data = {
      ...body,
      images: sanitizedImages.images,
      mainImage: sanitizedImages.mainImage,
      slug,
      brandSlug,
      purchasePricePerMl,
      marketPricePerMl,
      totalStockMl: normalizedBottleSizeMl,
      costPricePerMl: purchasePricePerMl,
      bottleCost: Number.isFinite(bottleCost) ? bottleCost : 0,
      packagingCost: Number.isFinite(packagingCost) ? packagingCost : 0,
      pricingTier: getBrandTier(marketPricePerMl * Math.max(1, normalizedBottleSizeMl || 100)),
      fragranceNoteIds: notes.fragranceNoteIds,
      fragranceNotes: notes.fragranceNotes,
      topNoteIds: notes.fragranceNoteIds.top,
      middleNoteIds: notes.fragranceNoteIds.middle,
      baseNoteIds: notes.fragranceNoteIds.base,
      topNotes: notes.fragranceNotes.top,
      middleNotes: notes.fragranceNotes.middle,
      baseNotes: notes.fragranceNotes.base,
      keyNotes: notes.keyNotes,
      noteSearchIndex: notes.noteSearchIndex,
      noteIdIndex: notes.noteIdIndex,
      seoKeywords,
      canonicalPath: buildCanonicalProductPath({ name: String(body.name || ""), brand: String(body.brand || ""), slug, brandSlug }),
      canonicalUrl: buildCanonicalProductUrl({ name: String(body.name || ""), brand: String(body.brand || ""), slug, brandSlug }),
      fullBottleAvailable: body.fullBottleAvailable ?? true,
      fullBottlePrice: body.fullBottlePrice ?? null,
      partialDealType,
      partialSellingPrice: partialDealType ? (Number.isFinite(partialSellingPrice) ? partialSellingPrice : 0) : 0,
      rating: Number(body.rating ?? 4.9),
      reviewCount: Number(body.reviewCount ?? 0),
      totalOrders: Number(body.totalOrders ?? 0),
      createdAt: now,
      updatedAt: now,
    };
    await db.collection(Collections.perfumes).doc(id).set(data);
    perfumesCache.clear();
    return NextResponse.json(serializeDoc({ id, ...data }), { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create perfume";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
