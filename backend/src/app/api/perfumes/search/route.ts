import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { buildStructuredNotes, getCanonicalNotesLibrary, getNoteLookup } from "@/lib/fragrance-notes";
import { buildProductSlug, resolvePerfumeSlug, resolveBrandSlug } from "@/lib/seo-catalog";

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

type BrandSections = {
  uaeBrands: string[];
  nicheBrands: string[];
  designerBrands: string[];
};

const DEFAULT_BRAND_SECTIONS: BrandSections = {
  uaeBrands: [
    "lattafa",
    "armaf",
    "afnan",
    "fragrance world",
    "rasasi",
    "al haramain",
    "al-haramain",
    "ajmal",
    "arabiyat",
    "emir",
    "paris corner",
    "riyad",
    "my perfumes",
    "zimaya",
  ],
  nicheBrands: [
    "creed",
    "amouage",
    "xerjoff",
    "parfums de marly",
    "roja",
    "initio",
    "montale",
    "mancera",
    "nishane",
    "byredo",
    "diptyque",
    "killian",
    "bdk",
    "memo",
    "penhaligon",
    "maison francis kurkdjian",
    "mfk",
    "frederic malle",
    "le labo",
  ],
  designerBrands: [],
};

let activePerfumesCache: { data: SearchPerfume[]; brands: string[]; ts: number } | null = null;
let brandSectionsCache: { data: BrandSections; ts: number } | null = null;
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

function normalizeBrandName(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}

async function getBrandSections(): Promise<BrandSections> {
  if (brandSectionsCache && Date.now() - brandSectionsCache.ts < ACTIVE_CACHE_TTL) {
    return brandSectionsCache.data;
  }

  try {
    const doc = await db.collection(Collections.settings).doc("default").get();
    const raw = (doc.data()?.brandSections || {}) as Record<string, unknown>;

    const toList = (value: unknown, fallback: string[]) => {
      if (!Array.isArray(value)) return fallback;
      const parsed = value
        .filter((item): item is string => typeof item === "string")
        .map((item) => normalizeBrandName(item))
        .filter(Boolean);
      return parsed.length > 0 ? Array.from(new Set(parsed)) : fallback;
    };

    const data: BrandSections = {
      uaeBrands: toList(raw.uaeBrands, DEFAULT_BRAND_SECTIONS.uaeBrands),
      nicheBrands: toList(raw.nicheBrands, DEFAULT_BRAND_SECTIONS.nicheBrands),
      designerBrands: toList(raw.designerBrands, DEFAULT_BRAND_SECTIONS.designerBrands),
    };

    brandSectionsCache = { data, ts: Date.now() };
    return data;
  } catch {
    return DEFAULT_BRAND_SECTIONS;
  }
}

function matchesBrandGroup(perfumeBrand: string, brandFilter: string, sections: BrandSections): boolean {
  const brand = normalizeBrandName(perfumeBrand);
  const filter = normalizeBrandName(brandFilter);

  if (!filter) return true;

  // Exact brand search still works for concrete brand names.
  if (brand === filter) return true;

  const isUae = sections.uaeBrands.some((keyword) => brand.includes(normalizeBrandName(keyword)));
  const isNiche = sections.nicheBrands.some((keyword) => brand.includes(normalizeBrandName(keyword)));
  const isDesignerConfigured = sections.designerBrands.some((keyword) => brand.includes(normalizeBrandName(keyword)));

  if (filter === "uae") return isUae;
  if (filter === "niche") return isNiche;

  // If designer list is configured in admin, prioritize it.
  if (filter === "designer") {
    if (sections.designerBrands.length > 0) return isDesignerConfigured;
    return !isUae && !isNiche;
  }

  // Fallback partial match for unknown filters.
  return brand.includes(filter);
}

function normalizeCategory(value: string): string {
  const v = value.toLowerCase().trim();
  if (["men", "male", "for him", "him"].includes(v)) return "men";
  if (["women", "female", "for her", "her", "ladies"].includes(v)) return "women";
  if (["unisex", "uni sex", "uni-sex"].includes(v)) return "unisex";
  if (["oud", "formal fragrances", "formal"].includes(v)) return "oud";
  return v;
}

function normalizeSeason(value: string): string {
  const v = value.toLowerCase().trim();
  if (["summer"].includes(v)) return "summer";
  if (["winter"].includes(v)) return "winter";
  if (["spring"].includes(v)) return "spring";
  if (["fall", "autumn"].includes(v)) return "fall";
  if (["all year", "all-year", "allseason", "all season", "year-round", "year round"].includes(v)) return "all year";
  return v;
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

  const [activeIndex, brandSections] = await Promise.all([
    getActivePerfumeIndex(),
    getBrandSections(),
  ]);
  let perfumes = [...activeIndex.perfumes];

  // Apply filters in memory (replaces Prisma where clauses)
  if (category) {
    const expectedCategory = normalizeCategory(category);
    perfumes = perfumes.filter((p) => {
      if (typeof p.category !== "string") return false;
      return normalizeCategory(p.category) === expectedCategory;
    });
  }
  if (season) {
    const expectedSeason = normalizeSeason(season);
    perfumes = perfumes.filter((p) => {
      if (typeof p.season !== "string") return false;
      return normalizeSeason(p.season) === expectedSeason;
    });
  }
  if (bestSeller === "true") {
    perfumes = perfumes.filter((p) => Number(p.totalOrders || 0) > 0);
  }
  if (brand) {
    perfumes = perfumes.filter((p) => {
      if (typeof p.brand !== "string") return false;
      return matchesBrandGroup(p.brand, brand, brandSections);
    });
  }
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
      const slug = resolvePerfumeSlug({ name: perfume.name || "Perfume", slug: "" });
      const brandSlug = resolveBrandSlug({ brand: perfume.brand || "Brand", brandSlug: "" });
      const productSlug = buildProductSlug({ name: perfume.name || "", slug, brand: perfume.brand || "", brandSlug });
      
      if (Array.isArray(perfume.keyNotes) && perfume.keyNotes.length > 0) {
        return {
          ...serializeDoc(perfume),
          slug,
          brandSlug,
          canonicalPath: `/products/${productSlug}`,
        };
      }
      const normalized = buildStructuredNotes(perfume, library);
      return {
        ...serializeDoc({
          ...perfume,
          keyNotes: normalized.keyNotes,
          fragranceNotes: normalized.fragranceNotes,
          fragranceNoteIds: normalized.fragranceNoteIds,
          noteSearchIndex: normalized.noteSearchIndex,
        }),
        slug,
        brandSlug,
        canonicalPath: `/products/${productSlug}`,
      };
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
