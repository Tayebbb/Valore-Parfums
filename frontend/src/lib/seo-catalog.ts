import { SITE_URL } from "@/lib/site-url";
import { unstable_cache } from "next/cache";

export { parseImageList } from "@/lib/image-utils";

export const SITE_NAME = "Valore Parfums";

export { SITE_URL } from "@/lib/site-url";

export interface PerfumeDocument {
  id: string;
  name: string;
  brand: string;
  inspiredBy?: string;
  category?: string;
  keyNotes?: string[];
  slug?: string;
  brandSlug?: string;
  description?: string;
  images?: string;
  isActive?: boolean;
  totalStockMl?: number;
  marketPricePerMl?: number;
  purchasePricePerMl?: number;
  isPersonalCollection?: boolean;
  rating?: number;
  reviewCount?: number;
  reviews?: Array<{ rating: number }>;
  fragranceNotes?: {
    top?: string[];
    middle?: string[];
    base?: string[];
  };
  performance?: {
    longevity?: string;
    projection?: string;
    bestSeason?: string;
  };
  fullBottleAvailable?: boolean;
  fullBottlePrice?: number | null;
  [key: string]: unknown;
}

export interface PerfumeReview {
  id: string;
  perfumeId: string;
  name: string;
  rating: number;
  comment: string;
  createdAt?: string;
}

type DataLayer = typeof import("@/lib/prisma");

async function getDataLayer(): Promise<DataLayer | null> {
  try {
    return await import("@/lib/prisma");
  } catch (error) {
    console.error("Failed to load Firestore data layer", error);
    return null;
  }
}

// Keep API responses JSON-safe even when Firestore Timestamps are present.
function serializeDocSafe(obj: unknown): unknown {
  if (obj == null) return obj;

  if (
    typeof obj === "object" &&
    obj !== null &&
    "toDate" in obj &&
    typeof (obj as { toDate?: () => Date }).toDate === "function"
  ) {
    return (obj as { toDate: () => Date }).toDate().toISOString();
  }

  if (Array.isArray(obj)) return obj.map((item) => serializeDocSafe(item));

  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = serializeDocSafe(value);
    }
    return result;
  }

  return obj;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/['`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function resolvePerfumeSlug(perfume: Pick<PerfumeDocument, "name" | "slug">): string {
  return perfume.slug && perfume.slug.trim() ? perfume.slug : slugify(perfume.name);
}

export function resolveBrandSlug(perfume: Pick<PerfumeDocument, "brand" | "brandSlug">): string {
  return perfume.brandSlug && perfume.brandSlug.trim() ? perfume.brandSlug : slugify(perfume.brand);
}

export function buildProductSlug(perfume: Pick<PerfumeDocument, "name" | "slug" | "brand" | "brandSlug">): string {
  const brandSlug = resolveBrandSlug(perfume);
  const perfumeSlug = resolvePerfumeSlug(perfume);
  if (perfumeSlug.startsWith(`${brandSlug}-`)) {
    const withoutBrandPrefix = perfumeSlug.slice(brandSlug.length + 1);
    return withoutBrandPrefix || perfumeSlug;
  }
  return perfumeSlug;
}

export function buildCanonicalProductPath(perfume: Pick<PerfumeDocument, "name" | "slug" | "brand" | "brandSlug">): string {
  return `/products/${buildProductSlug(perfume)}`;
}

export function buildCanonicalProductUrl(perfume: Pick<PerfumeDocument, "name" | "slug" | "brand" | "brandSlug">): string {
  return `${SITE_URL}${buildCanonicalProductPath(perfume)}`;
}

const getActivePerfumesCached = unstable_cache(
  async (): Promise<PerfumeDocument[]> => {
    try {
      const dataLayer = await getDataLayer();
      if (!dataLayer) return [];

      // Fetch all perfumes and filter client-side using isActive !== false.
      // This matches the admin UI behaviour and ensures products added directly
      // to Firestore without an explicit isActive field are still visible.
      const snap = await dataLayer.db.collection(dataLayer.Collections.perfumes).get();
      return snap.docs
        .map((doc) => {
          const raw = doc.data() as Record<string, unknown>;
          const perfume: PerfumeDocument = {
            id: doc.id,
            name: String(raw.name || "Perfume"),
            brand: String(raw.brand || "Brand"),
            ...raw,
          };

          // Always recompute slug/brandSlug from name/brand so stale
          // stored values (e.g. copy-pasted from another product) are ignored.
          return {
            ...perfume,
            createdAt: String(serializeDocSafe(raw.createdAt) ?? ""),
            storedSlug: typeof raw.slug === "string" ? raw.slug : undefined,
            slug: slugify(String(raw.name || perfume.name || "")),
            brandSlug: slugify(String(raw.brand || perfume.brand || "")),
            fullBottleAvailable: perfume.fullBottleAvailable ?? true,
          };
        })
        .filter((p) => p.isActive !== false)
        .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
    } catch (error) {
      console.error("getActivePerfumes failed", error);
      return [];
    }
  },
  ["active-perfumes"],
  { revalidate: 300, tags: ["perfumes"] },
);

export async function getActivePerfumes(): Promise<PerfumeDocument[]> {
  return getActivePerfumesCached();
}

const getPerfumeByBrandAndSlugCached = unstable_cache(
  async (brandSlug: string, perfumeSlug: string): Promise<PerfumeDocument | null> => {
    try {
      const dataLayer = await getDataLayer();
      if (!dataLayer) return null;

      const bySlugSnap = await dataLayer.db.collection(dataLayer.Collections.perfumes).where("slug", "==", perfumeSlug).limit(10).get();
      const docs = bySlugSnap.docs.map((doc) => {
        const raw = doc.data() as Record<string, unknown>;
        return {
          id: doc.id,
          name: String(raw.name || "Perfume"),
          brand: String(raw.brand || "Brand"),
          ...raw,
        } as PerfumeDocument;
      });

      const matched = docs.find((item) => resolveBrandSlug(item) === brandSlug && Boolean(item.isActive));
      if (matched) {
        return {
          ...matched,
          name: String(matched.name || "Perfume"),
          brand: String(matched.brand || "Brand"),
          slug: resolvePerfumeSlug(matched),
          brandSlug: resolveBrandSlug(matched),
          fullBottleAvailable: matched.fullBottleAvailable ?? true,
        };
      }

      const fallbackMatch = (await getActivePerfumes()).find(
        (item) => resolveBrandSlug(item) === brandSlug && resolvePerfumeSlug(item) === perfumeSlug
      );
      if (!fallbackMatch) return null;

      return {
        ...fallbackMatch,
        name: String(fallbackMatch.name || "Perfume"),
        brand: String(fallbackMatch.brand || "Brand"),
        slug: resolvePerfumeSlug(fallbackMatch),
        brandSlug: resolveBrandSlug(fallbackMatch),
        fullBottleAvailable: fallbackMatch.fullBottleAvailable ?? true,
      };
    } catch (error) {
      console.error("getPerfumeByBrandAndSlug failed", error);
      return null;
    }
  },
  ["perfume-by-brand-and-slug"],
  { revalidate: 300, tags: ["perfumes"] },
);

export async function getPerfumeByBrandAndSlug(brandSlug: string, perfumeSlug: string): Promise<PerfumeDocument | null> {
  return getPerfumeByBrandAndSlugCached(brandSlug, perfumeSlug);
}

const getPerfumeByIdCached = unstable_cache(
  async (id: string): Promise<PerfumeDocument | null> => {
    try {
      const dataLayer = await getDataLayer();
      if (!dataLayer) return null;

      const doc = await dataLayer.db.collection(dataLayer.Collections.perfumes).doc(id).get();
      if (!doc.exists) return null;
      const raw = doc.data() as Record<string, unknown>;
      const perfume: PerfumeDocument = {
        id: doc.id,
        name: String(raw.name || "Perfume"),
        brand: String(raw.brand || "Brand"),
        ...raw,
      };
      return {
        ...perfume,
        name: String(perfume.name || "Perfume"),
        brand: String(perfume.brand || "Brand"),
        slug: resolvePerfumeSlug(perfume),
        brandSlug: resolveBrandSlug(perfume),
        fullBottleAvailable: perfume.fullBottleAvailable ?? true,
      };
    } catch (error) {
      console.error("getPerfumeById failed", error);
      return null;
    }
  },
  ["perfume-by-id"],
  { revalidate: 300, tags: ["perfumes"] },
);

export async function getPerfumeById(id: string): Promise<PerfumeDocument | null> {
  return getPerfumeByIdCached(id);
}

export async function getRelatedPerfumes(perfume: PerfumeDocument, limit = 6): Promise<PerfumeDocument[]> {
  const active = await getActivePerfumes();
  return active
    .filter((item) => item.id !== perfume.id)
    .sort((a, b) => {
      const brandScoreA = a.brand === perfume.brand ? 1 : 0;
      const brandScoreB = b.brand === perfume.brand ? 1 : 0;
      if (brandScoreA !== brandScoreB) return brandScoreB - brandScoreA;
      return (b.reviewCount || 0) - (a.reviewCount || 0);
    })
    .slice(0, limit);
}

const getPerfumeReviewsCached = unstable_cache(
  async (perfumeId: string): Promise<PerfumeReview[]> => {
    try {
      const dataLayer = await getDataLayer();
      if (!dataLayer) return [];

      // Fetch without orderBy to avoid index requirement, then sort in memory
      const snap = await dataLayer.db
        .collection(dataLayer.Collections.perfumeReviews)
        .where("perfumeId", "==", perfumeId)
        .limit(100)
        .get();

      const reviews = snap.docs.map((doc) => serializeDocSafe({ id: doc.id, ...doc.data() })) as PerfumeReview[];

      // Sort by createdAt in descending order and limit to 50
      return reviews
        .sort((a, b) => {
          const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
          const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
          return bTime - aTime;
        })
        .slice(0, 50);
    } catch (error) {
      console.error("getPerfumeReviews failed", error);
      return [];
    }
  },
  ["perfume-reviews"],
  { revalidate: 120, tags: ["perfumes", "reviews"] },
);

export async function getPerfumeReviews(perfumeId: string): Promise<PerfumeReview[]> {
  return getPerfumeReviewsCached(perfumeId);
}

export function serializePerfumeForApi(perfume: Partial<PerfumeDocument> & { id: string }) {
  const safeName = perfume.name || "Perfume";
  const safeBrand = perfume.brand || "Brand";

  // Normalize season to array
  const season = Array.isArray(perfume.season)
    ? perfume.season
    : perfume.season
      ? [perfume.season]
      : [];

  return serializeDocSafe({
    ...perfume,
    name: safeName,
    brand: safeBrand,
    season,
    slug: resolvePerfumeSlug({ name: safeName, slug: perfume.slug }),
    brandSlug: resolveBrandSlug({ brand: safeBrand, brandSlug: perfume.brandSlug }),
    canonicalPath: buildCanonicalProductPath({ name: safeName, brand: safeBrand, slug: perfume.slug, brandSlug: perfume.brandSlug }),
    canonicalUrl: buildCanonicalProductUrl({ name: safeName, brand: safeBrand, slug: perfume.slug, brandSlug: perfume.brandSlug }),
    fullBottleAvailable: perfume.fullBottleAvailable ?? true,
  });
}
