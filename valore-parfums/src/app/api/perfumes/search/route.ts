import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";

const ACTIVE_CACHE_TTL = 60_000;
const SEARCH_CACHE_TTL = 20_000;

type SearchPerfume = {
  id: string;
  name?: string;
  brand?: string;
  inspiredBy?: string;
  description?: string;
  category?: string;
  season?: string;
  isBestSeller?: boolean;
  marketPricePerMl?: number;
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
  return [
    params.get("q") || "",
    params.get("category") || "",
    params.get("season") || "",
    params.get("bestSeller") || "",
    params.get("brand") || "",
    params.get("sort") || "newest",
  ].join("|");
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
    return NextResponse.json(cached.body);
  }

  const q = (searchParams.get("q") || "").toLowerCase();
  const category = searchParams.get("category") || "";
  const season = searchParams.get("season") || "";
  const bestSeller = searchParams.get("bestSeller");
  const brand = searchParams.get("brand") || "";
  const sort = searchParams.get("sort") || "newest";

  const activeIndex = await getActivePerfumeIndex();
  let perfumes = [...activeIndex.perfumes];

  // Apply filters in memory (replaces Prisma where clauses)
  if (category) perfumes = perfumes.filter((p) => p.category === category);
  if (season) perfumes = perfumes.filter((p) => p.season === season);
  if (bestSeller === "true") perfumes = perfumes.filter((p) => p.isBestSeller);
  if (brand) perfumes = perfumes.filter((p) => p.brand === brand);

  // Text search across multiple fields (replaces Prisma contains/OR)
  if (q) {
    perfumes = perfumes.filter((p) =>
      p.name?.toLowerCase().includes(q) ||
      p.brand?.toLowerCase().includes(q) ||
      p.inspiredBy?.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q),
    );
  }

  // Sort (replaces Prisma orderBy)
  if (sort === "name-asc") perfumes.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  else if (sort === "name-desc") perfumes.sort((a, b) => (b.name || "").localeCompare(a.name || ""));
  else if (sort === "price-asc") perfumes.sort((a, b) => (a.marketPricePerMl || 0) - (b.marketPricePerMl || 0));
  else if (sort === "price-desc") perfumes.sort((a, b) => (b.marketPricePerMl || 0) - (a.marketPricePerMl || 0));
  else {
    // newest: sort by createdAt descending
    perfumes.sort((a, b) => asDate(b.createdAt).getTime() - asDate(a.createdAt).getTime());
  }

  const body = { perfumes: perfumes.map(serializeDoc), brands: activeIndex.brands };
  searchResultCache.set(cacheKey, { body, ts: Date.now() });
  if (searchResultCache.size > 50) {
    const firstKey = searchResultCache.keys().next().value;
    if (firstKey) searchResultCache.delete(firstKey);
  }

  return NextResponse.json(body);
}
