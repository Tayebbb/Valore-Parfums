import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import PerfumePageClient from "@/components/store/PerfumeDetailClient";
import {
  SITE_NAME,
  SITE_URL,
  buildCanonicalProductPath,
  buildFaqJsonLd,
  buildProductJsonLd,
  buildProductMetaDescription,
  buildProductMetaTitle,
  computeAggregateRating,
  getPerfumeByBrandAndSlug,
  getPerfumeOffers,
  getPerfumeReviews,
  getProductKeywordBundle,
  serializePerfumeForApi,
} from "@/lib/seo-catalog";

export const revalidate = 300;

type RouteProps = {
  params: Promise<{ brand: string; perfume: string }>;
};

async function loadProduct(brand: string, perfume: string) {
  return getPerfumeByBrandAndSlug(brand, perfume);
}

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { brand, perfume } = await params;
  const product = await loadProduct(brand, perfume);

  if (!product) {
    return {
      title: `${SITE_NAME} | Perfume Not Found`,
      description: "Browse authentic perfume decants and full bottle requests in Bangladesh.",
    };
  }

  const canonicalPath = buildCanonicalProductPath(product);
  const title = buildProductMetaTitle(product);
  const description = buildProductMetaDescription(product);
  const keywords = getProductKeywordBundle(product.name);

  return {
    title,
    description,
    alternates: { canonical: canonicalPath },
    keywords: [...keywords.titleKeywords, ...keywords.descriptionKeywords, ...keywords.headingKeywords],
    openGraph: {
      title,
      description,
      url: `${SITE_URL}${canonicalPath}`,
      siteName: SITE_NAME,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function BrandProductPage({ params }: RouteProps) {
  const { brand, perfume } = await params;
  const product = await loadProduct(brand, perfume);

  if (!product) notFound();

  const canonicalPath = buildCanonicalProductPath(product);
  const requestedPath = `/brand/${brand}/${perfume}`;
  if (requestedPath !== canonicalPath) {
    redirect(canonicalPath);
  }

  const [offers, reviews] = await Promise.all([
    getPerfumeOffers(product),
    getPerfumeReviews(product.id),
  ]);

  const reviewAverage =
    reviews.length > 0
      ? reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length
      : product.rating;
  const aggregate = computeAggregateRating(product, reviews.length, reviewAverage);

  const productJsonLd = buildProductJsonLd(product, offers, aggregate);
  const faqJsonLd = buildFaqJsonLd(product);
  const canonicalUrl = `${SITE_URL}${canonicalPath}`;
  const initialPrices = offers.decantOffers.map((offer) => ({
    ml: offer.ml,
    sellingPrice: offer.price,
    totalCost: 0,
    bottleCost: 0,
    packagingCost: 0,
    profitMargin: 0,
    tier: "",
    inStock: offer.available,
    bottleAvailable: offer.available,
    available: offer.available,
  }));

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: buildProductMetaTitle(product),
            description: buildProductMetaDescription(product),
            url: canonicalUrl,
          }),
        }}
      />
      <PerfumePageClient
        params={Promise.resolve({ id: product.id })}
        initialPerfume={serializePerfumeForApi(product) as Parameters<typeof PerfumePageClient>[0]["initialPerfume"]}
        initialPrices={initialPrices}
        initialBulkRules={[]}
      />
    </>
  );
}
