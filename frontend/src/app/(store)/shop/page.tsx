import type { Metadata } from "next";
import { buildCanonicalProductPath, getActivePerfumes, type PerfumeDocument } from "@/lib/seo-catalog";
import { CATALOG_PAGE_SIZE, catalogPage, catalogPagePath, paginateCatalog, type CatalogQuery } from "@/lib/catalog-pagination";
import { resolveBackendBaseUrl } from "@/lib/backend-base-url";
import { getCatalogPrices } from "@/lib/catalog-pricing";
import ShopContent, { type Perfume } from "./ShopContent";

const filterKeys = ["q", "category", "season", "bestSeller", "brand", "deal", "notes", "sort"];

function shopFilters(query: CatalogQuery) {
  const filters = new URLSearchParams();
  for (const key of filterKeys) {
    const value = query[key];
    if (typeof value === "string" && value && !(key === "sort" && value === "newest")) {
      filters.set(key, value);
    }
  }
  return filters;
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<CatalogQuery> }): Promise<Metadata> {
  const query = await searchParams;
  const page = catalogPage(query);
  const filtered = shopFilters(query).size > 0;
  const canonical = catalogPagePath("/shop", filtered ? 1 : page);
  const title = `Shop Perfume Decants in Bangladesh${page > 1 && !filtered ? ` – Page ${page}` : ""}`;
  const description = "Compare fragrances by brand, scent notes and season. Choose a decant size and see its price in BDT.";
  return {
    title, description,
    alternates: { canonical },
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
    openGraph: { title, description, url: canonical, type: "website" },
  };
}

export default async function ShopPage({ searchParams }: { searchParams: Promise<CatalogQuery> }) {
  const query = await searchParams;
  const filters = shopFilters(query);
  const page = catalogPage(query);
  const active = await getActivePerfumes();
  const allBrands = Array.from(new Set(active.map((p) => p.brand).filter((brand) => brand && brand.toLowerCase() !== "valore parfums"))).sort();
  let records = active;
  let error: string | null = null;
  if (filters.size) {
    // Use the storefront search service so brand groups, partials and note matching
    // follow the same rules as the catalog maintained by the merchant.
    try {
      const base = resolveBackendBaseUrl();
      if (!base) throw new Error("Missing search service URL");
      const response = await fetch(`${base}/api/perfumes/search?${filters}`, {
        next: { revalidate: 60, tags: ["perfumes"] },
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new Error(`Catalog search returned ${response.status}`);
      const data: { perfumes: PerfumeDocument[] } = await response.json();
      const byId = new Map(active.map((p) => [p.id, p]));
      records = data.perfumes.map((p) => byId.get(p.id) || p);
    } catch {
      records = [];
      error = "We couldn’t load these results. Please try again.";
    }
  }
  const initialPerfumes: Perfume[] = records.map((p) => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    slug: p.slug || "",
    canonicalPath: buildCanonicalProductPath(p),
    category: String(p.category || ""),
    images: String(p.images || "[]"),
    totalStockMl: Number(p.totalStockMl || 0),
    isBestSeller: Boolean(p.isBestSeller),
    totalOrders: Number(p.totalOrders || 0),
  }));
  if (!error) paginateCatalog(initialPerfumes, page);
  const priceMap = await getCatalogPrices(initialPerfumes.map((perfume) => perfume.id));
  if (filters.get("sort")?.startsWith("price-")) {
    const lowest = (id: string) => Math.min(...(priceMap[id]?.prices || []).filter((offer) => offer.available).map((offer) => offer.sellingPrice));
    initialPerfumes.sort((a, b) => {
      const first = lowest(a.id);
      const second = lowest(b.id);
      if (!Number.isFinite(first)) return Number.isFinite(second) ? 1 : 0;
      if (!Number.isFinite(second)) return -1;
      return filters.get("sort") === "price-asc" ? first - second : second - first;
    });
  }
  return <ShopContent initialPerfumes={initialPerfumes} priceMap={priceMap} allBrands={allBrands} pageSize={CATALOG_PAGE_SIZE} error={error} />;
}
