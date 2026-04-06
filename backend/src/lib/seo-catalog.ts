import { parseImageList } from "@/lib/image-utils";
import { DEFAULT_TIER_MARGINS, calculateSellingPrice, getBrandTier, getTierProfitMargin, parseTierMargins } from "@/lib/utils";

export { parseImageList } from "@/lib/image-utils";

export const SITE_NAME = "Valore Parfums";

function normalizeSiteUrl(input?: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}

function resolveSiteUrl(): string {
  const fromPublicEnv = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
  if (fromPublicEnv) return fromPublicEnv;

  // Netlify provides URL/DEPLOY_PRIME_URL during build/runtime.
  const fromNetlify = normalizeSiteUrl(process.env.URL) || normalizeSiteUrl(process.env.DEPLOY_PRIME_URL);
  if (fromNetlify) return fromNetlify;

  return "https://valoreparfums.app";
}

export const SITE_URL = resolveSiteUrl();

export const DECANT_VARIANTS = [3, 10, 15, 30] as const;

export type DecantVariant = (typeof DECANT_VARIANTS)[number];

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

export interface PerfumeOffer {
  ml: number;
  price: number;
  available: boolean;
  availability:
    | "https://schema.org/InStock"
    | "https://schema.org/OutOfStock"
    | "https://schema.org/PreOrder"
    | "https://schema.org/BackOrder";
  url: string;
}

export interface PerfumeReview {
  id: string;
  perfumeId: string;
  name: string;
  rating: number;
  comment: string;
  createdAt?: string;
}

export interface ProductKeywordBundle {
  titleKeywords: string[];
  descriptionKeywords: string[];
  headingKeywords: string[];
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
  return perfumeSlug.startsWith(`${brandSlug}-`) ? perfumeSlug : `${brandSlug}-${perfumeSlug}`;
}

export function buildCanonicalProductPath(perfume: Pick<PerfumeDocument, "name" | "slug" | "brand" | "brandSlug">): string {
  return `/products/${buildProductSlug(perfume)}`;
}

export function buildCanonicalProductUrl(perfume: Pick<PerfumeDocument, "name" | "slug" | "brand" | "brandSlug">): string {
  return `${SITE_URL}${buildCanonicalProductPath(perfume)}`;
}

export function getProductKeywordBundle(perfumeName: string): ProductKeywordBundle {
  return {
    titleKeywords: [
      "perfume decant Bangladesh",
      `${perfumeName} 10ml decant`,
      `buy ${perfumeName} BD`,
      `full bottle ${perfumeName} Bangladesh`,
    ],
    descriptionKeywords: [
      `${perfumeName} decant 3ml 10ml 15ml 30ml`,
      `try before buy perfume ${perfumeName}`,
      `${perfumeName} authentic perfume Bangladesh`,
    ],
    headingKeywords: [
      `${perfumeName} decant Bangladesh`,
      `${perfumeName} full bottle request`,
      `buy ${perfumeName} perfume sample`,
    ],
  };
}

export function buildProductMetaTitle(perfume: Pick<PerfumeDocument, "name" | "brand">): string {
  return `${perfume.name} by ${perfume.brand} Decant (3ml-30ml) & Full Bottle | ${SITE_NAME}`;
}

export function buildProductMetaDescription(perfume: Pick<PerfumeDocument, "name">): string {
  return `Buy 100% authentic ${perfume.name} decants (3ml, 10ml, 15ml, 30ml) in Bangladesh. Try before you buy. Full bottle available on request.`;
}

export async function getActivePerfumes(): Promise<PerfumeDocument[]> {
  try {
    const dataLayer = await getDataLayer();
    if (!dataLayer) return [];

    const snap = await dataLayer.db.collection(dataLayer.Collections.perfumes).where("isActive", "==", true).get();
    return snap.docs.map((doc) => {
      const raw = doc.data() as Record<string, unknown>;
      const perfume: PerfumeDocument = {
        id: doc.id,
        name: String(raw.name || "Perfume"),
        brand: String(raw.brand || "Brand"),
        ...raw,
      };

      return {
        ...perfume,
        slug: resolvePerfumeSlug(perfume),
        brandSlug: resolveBrandSlug(perfume),
        fullBottleAvailable: perfume.fullBottleAvailable ?? true,
      };
    });
  } catch (error) {
    console.error("getActivePerfumes failed", error);
    return [];
  }
}

export async function getPerfumeByBrandAndSlug(brandSlug: string, perfumeSlug: string): Promise<PerfumeDocument | null> {
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

    const fallbackSnap = await dataLayer.db.collection(dataLayer.Collections.perfumes).where("isActive", "==", true).get();
    const fallbackDocs = fallbackSnap.docs.map((doc) => {
      const raw = doc.data() as Record<string, unknown>;
      return {
        id: doc.id,
        name: String(raw.name || "Perfume"),
        brand: String(raw.brand || "Brand"),
        ...raw,
      } as PerfumeDocument;
    });
    const fallbackMatch = fallbackDocs.find((item) => resolveBrandSlug(item) === brandSlug && resolvePerfumeSlug(item) === perfumeSlug);
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
}

export async function getPerfumeById(id: string): Promise<PerfumeDocument | null> {
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

export async function getPerfumeReviews(perfumeId: string): Promise<PerfumeReview[]> {
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
        const aTime = (a.createdAt as any) instanceof Date ? ((a.createdAt as any) as Date).getTime() : 0;
        const bTime = (b.createdAt as any) instanceof Date ? ((b.createdAt as any) as Date).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 50);
  } catch (error) {
    console.error("getPerfumeReviews failed", error);
    return [];
  }
}

async function getPricingConfig() {
  try {
    const dataLayer = await getDataLayer();
    if (!dataLayer) {
      return { sizes: [], bottles: [], packagingCost: 20, margins: DEFAULT_TIER_MARGINS };
    }

    const [sizesSnap, bottlesSnap, settingsDoc] = await Promise.all([
      dataLayer.db.collection(dataLayer.Collections.decantSizes).get(),
      dataLayer.db.collection(dataLayer.Collections.bottles).get(),
      dataLayer.db.collection(dataLayer.Collections.settings).doc("default").get(),
    ]);

    const sizes = sizesSnap.docs
      .map((doc): { id: string } & Record<string, unknown> => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }))
      .filter((size) => Boolean(size.enabled))
      .sort((a, b) => Number(a.ml) - Number(b.ml));
    const bottles = bottlesSnap.docs.map((doc): { id: string } & Record<string, unknown> => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }));
    const settings = settingsDoc.exists ? settingsDoc.data() : null;
    const packagingCost = Number(settings?.packagingCost ?? 20);
    const margins = parseTierMargins((settings as { tierMargins?: string } | null)?.tierMargins);

    return { sizes, bottles, packagingCost, margins };
  } catch (error) {
    console.error("getPricingConfig failed", error);
    return { sizes: [], bottles: [], packagingCost: 20, margins: DEFAULT_TIER_MARGINS };
  }
}

function computeFullBottlePrice(perfume: PerfumeDocument): number {
  if (typeof perfume.fullBottlePrice === "number" && Number.isFinite(perfume.fullBottlePrice) && perfume.fullBottlePrice > 0) {
    return perfume.fullBottlePrice;
  }
  const perMl = Number(perfume.marketPricePerMl || 0);
  return Math.max(0, Math.ceil(perMl * 100));
}

export async function getPerfumeOffers(perfume: PerfumeDocument): Promise<{ decantOffers: PerfumeOffer[]; fullBottleOffer: PerfumeOffer }> {
  const { sizes, bottles, packagingCost, margins } = await getPricingConfig();
  const marketPricePerMl = Number(perfume.marketPricePerMl || 0);
  const purchasePricePerMl = Number(perfume.purchasePricePerMl || marketPricePerMl || 0);
  const totalStockMl = Number(perfume.totalStockMl || 0);
  const tier = getBrandTier(Math.max(1, marketPricePerMl) * 100);

  const sizeBuckets = sizes.length > 0 ? sizes : DECANT_VARIANTS.map((ml) => ({ ml, enabled: true }));

  const decantOffers: PerfumeOffer[] = sizeBuckets
    .filter((size) => DECANT_VARIANTS.includes(Number(size.ml) as DecantVariant))
    .map((size) => {
      const ml = Number(size.ml);
      const bottle = bottles.find((item) => Number(item.ml) === ml);
      const bottleCost = Number((bottle as { costPerBottle?: number } | undefined)?.costPerBottle || 0);
      const bottleAvailable = Number((bottle as { availableCount?: number } | undefined)?.availableCount || 0) > 0;
      const margin = getTierProfitMargin(tier, ml, margins);
      const price = calculateSellingPrice(marketPricePerMl || purchasePricePerMl, ml, bottleCost, packagingCost, margin);
      const available = totalStockMl >= ml && bottleAvailable;

      return {
        ml,
        price,
        available,
        availability: available ? "https://schema.org/InStock" as const : "https://schema.org/OutOfStock" as const,
        url: `${buildCanonicalProductUrl(perfume)}?size=${ml}ml`,
      };
    })
    .sort((a, b) => a.ml - b.ml);

  const fullBottlePrice = computeFullBottlePrice(perfume);
  const fullBottleAvailable = perfume.fullBottleAvailable ?? true;
  const fullBottleOffer: PerfumeOffer = {
    ml: 100,
    price: fullBottlePrice,
    available: fullBottleAvailable,
    availability: fullBottleAvailable ? "https://schema.org/PreOrder" : "https://schema.org/BackOrder",
    url: `${buildCanonicalProductUrl(perfume)}#request-full-bottle`,
  };

  return { decantOffers, fullBottleOffer };
}

export function computeAggregateRating(perfume: PerfumeDocument, reviewCountOverride?: number, ratingOverride?: number): { ratingValue: number; reviewCount: number } {
  const reviewCount = Number(reviewCountOverride ?? perfume.reviewCount ?? perfume.reviews?.length ?? 0);
  if (ratingOverride && reviewCount > 0) {
    return { ratingValue: Number(ratingOverride.toFixed(2)), reviewCount };
  }

  if (Array.isArray(perfume.reviews) && perfume.reviews.length > 0) {
    const total = perfume.reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0);
    const ratingValue = total / perfume.reviews.length;
    return { ratingValue: Number(ratingValue.toFixed(2)), reviewCount: perfume.reviews.length };
  }

  return {
    ratingValue: Number((Number(perfume.rating || 4.9)).toFixed(2)),
    reviewCount: reviewCount || 1,
  };
}

export function buildProductJsonLd(
  perfume: PerfumeDocument,
  offers: { decantOffers: PerfumeOffer[]; fullBottleOffer: PerfumeOffer },
  aggregate: { ratingValue: number; reviewCount: number },
) {
  const images = parseImageList(perfume.images).map((img) => (img.startsWith("http") ? img : `${SITE_URL}${img}`));

  const offerNodes = [
    ...offers.decantOffers.map((offer) => ({
      "@type": "Offer",
      sku: `${resolvePerfumeSlug(perfume)}-${offer.ml}ml`,
      price: String(offer.price),
      priceCurrency: "BDT",
      availability: offer.availability,
      url: offer.url,
      itemCondition: "https://schema.org/NewCondition",
      priceValidUntil: "2027-12-31",
      category: "Perfume Decant",
    })),
    {
      "@type": "Offer",
      sku: `${resolvePerfumeSlug(perfume)}-full-bottle`,
      price: String(offers.fullBottleOffer.price),
      priceCurrency: "BDT",
      availability: offers.fullBottleOffer.availability,
      url: offers.fullBottleOffer.url,
      itemCondition: "https://schema.org/NewCondition",
      category: "Perfume Full Bottle",
    },
  ];

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${perfume.name} by ${perfume.brand}`,
    description: perfume.description || buildProductMetaDescription(perfume),
    image: images,
    brand: {
      "@type": "Brand",
      name: perfume.brand,
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: String(aggregate.ratingValue),
      reviewCount: String(aggregate.reviewCount),
      bestRating: "5",
      worstRating: "1",
    },
    offers: offerNodes,
  };
}

export function buildFaqJsonLd(perfume: PerfumeDocument) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: `Is ${perfume.name} decant authentic?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `Yes. ${SITE_NAME} provides authentic ${perfume.name} decants from original bottles using sterile decant tools.`,
        },
      },
      {
        "@type": "Question",
        name: `Which ${perfume.name} size should I buy first?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: "Start with 3ml or 10ml if you are testing performance and skin chemistry. Move to 15ml or 30ml if you already love the scent.",
        },
      },
      {
        "@type": "Question",
        name: `Can I request a full bottle of ${perfume.name} in Bangladesh?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `Yes. Use the Request Full Bottle button to request ${perfume.name}. We source authentic bottles on demand in Bangladesh.`,
        },
      },
    ],
  };
}

export function buildInternalLinkAnchors(perfume: PerfumeDocument): string[] {
  return [
    `${perfume.name} decant Bangladesh`,
    `buy ${perfume.name} ${perfume.brand} decant`,
    `full bottle ${perfume.name} Bangladesh`,
    `${perfume.name} perfume sample`,
  ];
}

export function serializePerfumeForApi(perfume: Partial<PerfumeDocument> & { id: string }) {
  const safeName = perfume.name || "Perfume";
  const safeBrand = perfume.brand || "Brand";

  return serializeDocSafe({
    ...perfume,
    name: safeName,
    brand: safeBrand,
    slug: resolvePerfumeSlug({ name: safeName, slug: perfume.slug }),
    brandSlug: resolveBrandSlug({ brand: safeBrand, brandSlug: perfume.brandSlug }),
    canonicalPath: buildCanonicalProductPath({ name: safeName, brand: safeBrand, slug: perfume.slug, brandSlug: perfume.brandSlug }),
    canonicalUrl: buildCanonicalProductUrl({ name: safeName, brand: safeBrand, slug: perfume.slug, brandSlug: perfume.brandSlug }),
    fullBottleAvailable: perfume.fullBottleAvailable ?? true,
  });
}
