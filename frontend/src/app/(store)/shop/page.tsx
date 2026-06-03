import type { Metadata } from "next";
import { Suspense } from "react";
import { getActivePerfumes, SITE_URL } from "@/lib/seo-catalog";
import ShopContent, { type Perfume } from "./ShopContent";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Shop Perfume Decants & Samples | Valore Parfums Bangladesh",
  description: "Browse our full collection of authentic perfume decants and samples in Bangladesh. Filter by brand, season, and category.",
  alternates: { canonical: `${SITE_URL}/shop` },
  keywords: ["perfume decants shop", "buy perfume samples bangladesh", "fragrance shop dhaka"],
  openGraph: {
    title: "Shop Perfume Decants & Samples | Valore Parfums",
    description: "Browse authentic perfume decants from luxury brands. 3ml, 5ml, 10ml, 15ml, 30ml sizes available.",
    url: `${SITE_URL}/shop`,
    siteName: "Valore Parfums",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Shop Perfume Decants | Valore Parfums Bangladesh",
    description: "Browse authentic perfume decants. Multiple sizes available.",
  },
};

function ShopSkeleton() {
  return (
    <div className="px-4 sm:px-6 md:px-[5%] py-6 sm:py-8">
      <div className="flex gap-8">
        <aside className="hidden lg:block w-64 shrink-0">
          <div className="skeleton h-96 rounded" />
        </aside>
        <div className="flex-1">
          <div className="skeleton h-10 w-64 mb-6 rounded" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
            {[...Array(9)].map((_, i) => (
              <div key={i}>
                <div className="skeleton aspect-3/4 rounded" />
                <div className="skeleton h-4 mt-3 rounded w-3/4" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function ShopPage() {
  const docs = await getActivePerfumes();

  const initialPerfumes: Perfume[] = docs.map((p) => ({
    id: p.id,
    name: String(p.name || ""),
    brand: String(p.brand || ""),
    slug: String(p.slug || ""),
    inspiredBy: String(p.inspiredBy || ""),
    category: String(p.category || ""),
    images: String(p.images || "[]"),
    totalStockMl: Number(p.totalStockMl || 0),
    season: Array.isArray(p.season)
      ? (p.season as string[]).map(String)
      : p.season
        ? [String(p.season as string)]
        : [],
    isBestSeller: Boolean(p.isBestSeller),
    totalOrders: Number(p.totalOrders || 0),
    marketPricePerMl: Number(p.marketPricePerMl || 0),
    fragranceNotes: p.fragranceNotes as Perfume["fragranceNotes"],
    keyNotes: Array.isArray(p.keyNotes) ? (p.keyNotes as string[]).map(String) : undefined,
  }));

  return (
    <Suspense fallback={<ShopSkeleton />}>
      <ShopContent initialPerfumes={initialPerfumes} />
    </Suspense>
  );
}