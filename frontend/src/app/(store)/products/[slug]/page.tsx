import type { Metadata } from "next";
import { cache } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import PerfumePageClient from "@/components/store/PerfumeDetailClient";
import { getCatalogPrices } from "@/lib/catalog-pricing";
import { SITE_URL, buildCanonicalProductPath, buildProductSlug, getActivePerfumes, parseImageList, resolveBrandSlug, resolvePerfumeSlug } from "@/lib/seo-catalog";
import { JsonLd } from "@/components/seo/JsonLd";
import { productDescription } from "@/lib/product-description";

type RouteProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ size?: string | string[] }>;
};

const loadProduct = cache(async (slug: string) => {
  const perfumes = await getActivePerfumes();
  // Canonical names take precedence over historical stored slugs, which may be duplicated.
  const canonical = perfumes.find((p) => buildProductSlug(p) === slug);
  if (canonical) return canonical;

  const matches = perfumes.filter((p) => {
    const legacy = resolvePerfumeSlug(p);
    const brand = resolveBrandSlug(p);
    return slug === legacy || slug === `${brand}-${legacy}` || slug === p.storedSlug ||
      (typeof p.storedSlug === "string" && slug === `${brand}-${p.storedSlug}`);
  });
  return matches.length === 1 ? matches[0] : null;
});

const loadPrices = cache(async (id: string) => (await getCatalogPrices([id]))[id]?.prices ?? []);

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await loadProduct(slug);
  if (!product) return { title: "Perfume Not Found", robots: { index: false } };

  const canonical = buildCanonicalProductPath(product);
  const title = `${product.brand} ${product.name}${product.partialDealType === "full_bottle" ? "" : " Decant"}`;
  const description = productDescription(product, await loadPrices(product.id));
  const image = parseImageList(product.images)[0];
  const images = image ? [{ url: new URL(image, SITE_URL).href, alt: `${product.brand} ${product.name}` }] : [];
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: `${SITE_URL}${canonical}`, type: "website", images },
    twitter: { title, description, card: "summary_large_image", images },
  };
}

export default async function ProductPage({ params, searchParams }: RouteProps) {
  const { slug } = await params;
  const product = await loadProduct(slug);
  if (!product) notFound();

  const path = buildCanonicalProductPath(product);
  const { size } = await searchParams;
  const requestedSize = typeof size === "string" && /^\d+(?:\.\d+)?ml$/.test(size) ? size : "";
  if (path !== `/products/${slug}`) {
    permanentRedirect(requestedSize ? `${path}?size=${requestedSize}` : path);
  }

  const canonicalUrl = `${SITE_URL}${path}`;
  const brandPath = `/brand/${resolveBrandSlug(product)}`;
  const prices = await loadPrices(product.id);
  const season = Array.isArray(product.season) ? product.season : product.season ? [product.season] : [];
  return (
    <>
      <JsonLd value={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: "Shop", item: `${SITE_URL}/shop` },
          { "@type": "ListItem", position: 3, name: product.brand, item: `${SITE_URL}${brandPath}` },
          { "@type": "ListItem", position: 4, name: product.name, item: canonicalUrl },
        ],
      }} />
      <PerfumePageClient
        key={`${product.id}:${requestedSize}`}
        brandPath={brandPath}
        fullBottleEnquiry={product.fullBottleAvailable === true}
        skuPrefix={resolvePerfumeSlug(product)}
        canonicalUrl={canonicalUrl}
        requestedMl={requestedSize ? Number.parseFloat(requestedSize) : null}
        initialPerfume={{
          id: product.id,
          name: product.name,
          brand: product.brand,
          category: product.category,
          images: product.images,
          description: product.description,
          inspiredBy: product.inspiredBy,
          totalStockMl: product.totalStockMl,
          fragranceNotes: product.fragranceNotes,
          partialDealType: product.partialDealType === "full_bottle" || product.partialDealType === "decant" ? product.partialDealType : undefined,
          season: season.filter((item): item is string => typeof item === "string"),
        }}
        initialPrices={prices}
      />
    </>
  );
}
