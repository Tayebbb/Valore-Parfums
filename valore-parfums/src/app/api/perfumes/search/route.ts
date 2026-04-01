import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { buildStructuredNotes, getCanonicalNotesLibrary, getNoteLookup } from "@/lib/fragrance-notes";

const ACTIVE_CACHE_TTL = 60_000;
const SEARCH_CACHE_TTL = 20_000;
const CACHE_CONTROL = "public, s-maxage=20, stale-while-revalidate=60";

type SearchPerfume = {
  id: string;
  name?: string;
  brand?: string;
  inspiredBy?: string;
  description?: string;
  category?: string;
  season?: string;
  isBestSeller?: boolean;
  totalOrders?: number;
  marketPricePerMl?: number;
  fragranceNotes?: {
    top?: string[];
    middle?: string[];
    base?: string[];
    all?: string[];
  };
  fragranceNoteIds?: {
    all?: string[];
    top?: string[];
    middle?: string[];
    base?: string[];
  };
  keyNotes?: string[];
  noteSearchIndex?: string[];
  noteIdIndex?: Record<string, 1>;
  createdAt?: { toDate?: () => Date } | Date | string | number;
  [key: string]: unknown;
};

let activePerfumesCache: { data: SearchPerfume[]; brands: string[]; ts: number } | null = null;
const searchResultCache = new Map<string, { body: { perfumes: unknown[]; brands: string[] }; ts: number }>();

function asDate(value: SearchPerfume["createdAt"]): Date {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate();
  }
  return new Date((value as string | number | Date | undefined) || 0);
}

function getSearchCacheKey(params: URLSearchParams): string {
  const keyObject = {
    q: params.get("q") || "",
    category: params.get("category") || "",
    season: params.get("season") || "",
    bestSeller: params.get("bestSeller") || "",
    brand: params.get("brand") || "",
    notes: params.get("notes") || "",
    sort: params.get("sort") || "newest",
  };
  return JSON.stringify(keyObject);
}

function asLowerList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.toLowerCase().trim())
    .filter(Boolean);
}

async function getActivePerfumeIndex(): Promise<{ perfumes: SearchPerfume[]; brands: string[] }> {
  if (activePerfumesCache && Date.now() - activePerfumesCache.ts < ACTIVE_CACHE_TTL) {
    return { perfumes: activePerfumesCache.data, brands: activePerfumesCache.brands };
  }

  const snap = await db.collection(Collections.perfumes).where("isActive", "==", true).get();
  const perfumes = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as SearchPerfume[];
  const brandSet = new Set<string>();
  for (const p of perfumes) {
    if (typeof p.brand === "string" && p.brand) brandSet.add(p.brand);
  }

  const brands = Array.from(brandSet).sort();
  activePerfumesCache = { data: perfumes, brands, ts: Date.now() };
  return { perfumes, brands };
}

// GET /api/perfumes/search?q=...&category=...&season=...&brand=...&sort=...
// Updated: Firestore doesn't support OR/contains queries natively,
// so we fetch all active perfumes and filter in memory.
// For production scale, consider Algolia or Typesense.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cacheKey = getSearchCacheKey(searchParams);
  const cached = searchResultCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < SEARCH_CACHE_TTL) {
    return NextResponse.json(cached.body, { headers: { "Cache-Control": CACHE_CONTROL } });
  }

  const q = (searchParams.get("q") || "").toLowerCase();
  const category = searchParams.get("category") || "";
  const season = searchParams.get("season") || "";
  const bestSeller = searchParams.get("bestSeller");
  const brand = searchParams.get("brand") || "";
  const selectedNotes = (searchParams.get("notes") || "")
    .split(",")
    .map((note) => note.trim().toLowerCase())
    .filter(Boolean);
  const library = getCanonicalNotesLibrary();
  const { byLabel } = getNoteLookup(library);
  const selectedNoteIds = Array.from(new Set(selectedNotes.map((note) => byLabel.get(note)?.id || "").filter(Boolean)));
  const sort = searchParams.get("sort") || "newest";

  const activeIndex = await getActivePerfumeIndex();
  let perfumes = [...activeIndex.perfumes];

  // Apply filters in memory (replaces Prisma where clauses)
  if (category) perfumes = perfumes.filter((p) => p.category === category);
  if (season) perfumes = perfumes.filter((p) => p.season === season);
  if (bestSeller === "true") {
    perfumes = perfumes.filter((p) => Number(p.totalOrders || 0) > 0);
  }
  if (brand) perfumes = perfumes.filter((p) => p.brand === brand);
  if (selectedNotes.length > 0) {
    perfumes = perfumes.filter((p) => {
      const noteIndex = new Set([
        ...(Array.isArray(p.fragranceNoteIds?.all) ? p.fragranceNoteIds?.all : []),
        ...asLowerList(p.fragranceNotes?.all),
        ...asLowerList(p.fragranceNotes?.top),
        ...asLowerList(p.fragranceNotes?.middle),
        ...asLowerList(p.fragranceNotes?.base),
      ]);
      const matchesByName = selectedNotes.every((note) => noteIndex.has(note));
      const matchesById = selectedNoteIds.length > 0 && selectedNoteIds.every((id) => noteIndex.has(id));
      return matchesByName || matchesById;
    });
  }

  // Text search across multiple fields (replaces Prisma contains/OR)
  if (q) {
    perfumes = perfumes.filter((p) =>
      p.name?.toLowerCase().includes(q) ||
      p.brand?.toLowerCase().includes(q) ||
      p.inspiredBy?.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q) ||
      asLowerList(p.fragranceNotes?.all).some((note) => note.includes(q)) ||
      asLowerList(p.noteSearchIndex).some((note) => note.includes(q)),
    );
  }

  // Sort (replaces Prisma orderBy)
  if (bestSeller === "true") {
    perfumes.sort((a, b) => {
      const orderDiff = Number(b.totalOrders || 0) - Number(a.totalOrders || 0);
      if (orderDiff !== 0) return orderDiff;
      return asDate(b.createdAt).getTime() - asDate(a.createdAt).getTime();
    });
  } else if (sort === "name-asc") perfumes.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  else if (sort === "name-desc") perfumes.sort((a, b) => (b.name || "").localeCompare(a.name || ""));
  else if (sort === "price-asc") perfumes.sort((a, b) => (a.marketPricePerMl || 0) - (b.marketPricePerMl || 0));
  else if (sort === "price-desc") perfumes.sort((a, b) => (b.marketPricePerMl || 0) - (a.marketPricePerMl || 0));
  else {
    // newest: sort by createdAt descending
    perfumes.sort((a, b) => asDate(b.createdAt).getTime() - asDate(a.createdAt).getTime());
  }

  const body = {
    perfumes: perfumes.map((perfume) => {
      if (Array.isArray(perfume.keyNotes) && perfume.keyNotes.length > 0) {
        return serializeDoc(perfume);
      }
      const normalized = buildStructuredNotes(perfume, library);
      return serializeDoc({
        ...perfume,
        keyNotes: normalized.keyNotes,
        fragranceNotes: normalized.fragranceNotes,
        fragranceNoteIds: normalized.fragranceNoteIds,
        noteSearchIndex: normalized.noteSearchIndex,
      });
    }),
    brands: activeIndex.brands,
  };
  searchResultCache.set(cacheKey, { body, ts: Date.now() });
  if (searchResultCache.size > 50) {
    const firstKey = searchResultCache.keys().next().value;
    if (firstKey) searchResultCache.delete(firstKey);
  }

  return NextResponse.json(body, { headers: { "Cache-Control": CACHE_CONTROL } });
}
