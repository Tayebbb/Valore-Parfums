import { Product, StockStatus, BrandTier, PerfumeVariant } from "@/types/product";
import {
  getActivePerfumes,
  buildProductSlug,
  resolvePerfumeSlug,
  resolveBrandSlug,
} from "@/lib/seo-catalog";

// Server-side pricing calculation — never expose cost data to client
const BRAND_TIER_MARGINS = {
  budget: { min: 0.25, max: 0.35 },
  premium: { min: 0.2, max: 0.3 },
  luxury: { min: 0.3, max: 0.5 },
};

function calcDecantPrice(
  marketPricePerML: number,
  ml: number,
  tier: keyof typeof BRAND_TIER_MARGINS,
  bottleCost: number,
  packagingCost: number
): number {
  const margin =
    (BRAND_TIER_MARGINS[tier].min + BRAND_TIER_MARGINS[tier].max) / 2;
  return parseFloat(
    (
      marketPricePerML * ml * (1 + margin) +
      bottleCost +
      packagingCost
    ).toFixed(2)
  );
}

function determineStockStatus(stockMl: number): StockStatus {
  if (stockMl === 0) return "out_of_stock";
  if (stockMl < 50) return "limited";
  return "in_stock";
}

function getBrandTier(brand: string): BrandTier {
  const luxuryBrands = [
    "Dior",
    "Chanel",
    "Tom Ford",
    "Creed",
    "Roja",
    "Penhaligon's",
  ];
  const premiumBrands = [
    "Guerlain",
    "Lancôme",
    "Yves Saint Laurent",
    "Givenchy",
    "Valentino",
  ];

  if (luxuryBrands.some((b) => brand.toLowerCase().includes(b.toLowerCase())))
    return "luxury";
  if (premiumBrands.some((b) => brand.toLowerCase().includes(b.toLowerCase())))
    return "premium";
  return "budget";
}

/**
 * Fetch a single product by slug from Firestore
 * Slug format: brand-perfume-name (e.g., ysl-myself-edp)
 * Query by slug field directly
 */
export async function getProduct(slug: string): Promise<Product | null> {
  try {
    const perfumes = await getActivePerfumes();
    const matched = perfumes.find((perfume) => {
      const legacySlug = resolvePerfumeSlug(perfume);
      const canonicalSlug = buildProductSlug(perfume);
      return slug === legacySlug || slug === canonicalSlug;
    });

    if (!matched) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const perfumeData = matched as any;

    const brandTier = getBrandTier(perfumeData.brand);
    const marketPricePerML = perfumeData.marketPricePerMl || 15;
    const bottleCost = perfumeData.bottleCost || 50;
    const packagingCost = perfumeData.packagingCost || 30;
    const marketFullBottlePrice = perfumeData.marketFullBottlePrice || 3000;

    // Build variants from stock/pricing data
    const variants: PerfumeVariant[] = [];

    // Decants: 3ml, 5ml, 10ml, 15ml, 30ml
    const decantSizes = [3, 5, 10, 15, 30];
    for (const ml of decantSizes) {
      const price = calcDecantPrice(
        marketPricePerML,
        ml,
        brandTier,
        bottleCost,
        packagingCost
      );

      const existingDecantStock = variants
        .filter((v) => v.type === "decant")
        .reduce((sum, v) => sum + v.sizeML, 0);

      variants.push({
        type: "decant",
        sizeML: ml,
        price,
        stock: determineStockStatus(
          perfumeData.totalStockMl - existingDecantStock - ml
        ),
        sku: `${slug}-${ml}ml`,
        image: (perfumeData.images && JSON.parse(perfumeData.images || "[]")[0]) || perfumeData.mainImage || "/images/placeholder.png",
      } as PerfumeVariant);
    }

    // Full bottle: standard sizes (50ml, 100ml)
    const fullBottleSizes = [
      { size: 50, price: 1500 },
      { size: 100, price: 2500 },
    ];
    for (const fb of fullBottleSizes) {
      variants.push({
        type: "full_bottle",
        sizeML: fb.size,
        price: fb.price,
        stock:
          perfumeData.totalStockMl >= fb.size
            ? ("in_stock" as const)
            : ("out_of_stock" as const),
        sku: `${slug}-full-bottle-${fb.size}ml`,
        image: (perfumeData.images && JSON.parse(perfumeData.images || "[]")[0]) || perfumeData.mainImage || "/images/placeholder.png",
      } as PerfumeVariant);
    }

    // Parse fragrance notes
    const notes = perfumeData.fragranceNotes || {
      top: perfumeData.topNotes?.slice(0, 2) || perfumeData.keyNotes?.slice(0, 2) || ["musk", "citrus"],
      middle: perfumeData.middleNotes?.slice(0, 2) || perfumeData.keyNotes?.slice(1, 3) || ["floral", "woody"],
      base: perfumeData.baseNotes?.slice(0, 2) || perfumeData.keyNotes?.slice(2, 4) || ["amber", "sandalwood"],
    };

    const brandSlug = resolveBrandSlug({ brand: perfumeData.brand, brandSlug: perfumeData.brandSlug });
    const canonicalSlug = buildProductSlug({
      name: perfumeData.name,
      slug: perfumeData.slug,
      brand: perfumeData.brand,
      brandSlug: perfumeData.brandSlug,
    });

    return {
      slug: canonicalSlug,
      brand: perfumeData.brand,
      name: perfumeData.name,
      concentration: perfumeData.concentration || "EDP",
      brandTier,
      marketPricePerML,
      bottleCost,
      packagingCost,
      mainImage: (perfumeData.images && JSON.parse(perfumeData.images || "[]")[0]) || perfumeData.mainImage || "/images/placeholder.png",
      notes,
      authenticityProof: "Direct from brand distributor — guaranteed authentic.",
      marketFullBottlePrice,
      variants,
      relatedSlugs: perfumeData.relatedSlugs || [],
      brandSlug,
      fragranceFamily: perfumeData.category || perfumeData.fragranceFamily || "Fruity",
      relatedArticles: perfumeData.relatedArticles || [],
      category: perfumeData.category,
      totalOrders: perfumeData.totalOrders || 0,
      isBestSeller: perfumeData.isBestSeller || false,
    };
  } catch (error) {
    console.error(`[getProduct] Error fetching product ${slug}:`, error);
    return null;
  }
}

/**
 * Fetch all product slugs for static generation
 * Used in generateStaticParams()
 * Leverages existing getActivePerfumes from seo-catalog
 */
export async function getAllProductSlugs(): Promise<string[]> {
  try {
    const perfumes = await getActivePerfumes();
    return perfumes.map((p) => buildProductSlug(p));
  } catch (error) {
    console.error("[getAllProductSlugs] Error:", error);
    return [];
  }
}

/**
 * Fetch related products — returns first N active products (excluding current)
 */
export async function getRelatedProducts(
  currentSlug: string,
  limit: number = 3
): Promise<Product[]> {
  try {
    const perfumes = await getActivePerfumes();
    const products: Product[] = [];

    for (const perfume of perfumes) {
      const slug = buildProductSlug(perfume);
      if (slug && slug !== currentSlug) {
        const product = await getProduct(slug);
        if (product) {
          products.push(product);
          if (products.length >= limit) break;
        }
      }
    }
    return products;
  } catch (error) {
    console.error("[getRelatedProducts] Error:", error);
    return [];
  }
}
