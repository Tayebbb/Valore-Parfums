export type StockStatus = "in_stock" | "out_of_stock" | "limited";
export type BrandTier = "budget" | "premium" | "luxury";
export type VariantType = "full_bottle" | "decant";

export interface PerfumeVariant {
  type: VariantType;
  sizeML: number;
  price: number;
  stock: StockStatus;
  sku: string;
  image: string;
}

export interface Product {
  slug: string;
  brand: string;
  name: string;
  concentration: string;
  brandTier: BrandTier;
  marketPricePerML: number;
  bottleCost: number;
  packagingCost: number;
  mainImage: string;
  notes: { top: string[]; middle: string[]; base: string[] };
  authenticityProof: string;
  marketFullBottlePrice: number;
  variants: PerfumeVariant[];
  relatedSlugs: string[];
  brandSlug: string;
  fragranceFamily: string;
  relatedArticles?: { title: string; slug: string }[];
  category?: string;
  totalOrders?: number;
  isBestSeller?: boolean;
}
