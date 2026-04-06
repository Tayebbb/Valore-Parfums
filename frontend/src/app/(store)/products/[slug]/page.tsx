import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import PerfumePageClient from "@/components/store/PerfumeDetailClient";
import {
  SITE_NAME,
  SITE_URL,
  buildFaqJsonLd,
  buildProductJsonLd,
  buildProductMetaDescription,
  buildProductMetaTitle,
  buildProductSlug,
  computeAggregateRating,
  getActivePerfumes,
  getPerfumeOffers,
  getPerfumeReviews,
  getProductKeywordBundle,
  resolvePerfumeSlug,
} from "@/lib/seo-catalog";

type RouteProps = {
  params: Promise<{ slug: string }>;
};

async function getPerfumeByProductSlug(slug: string) {
  const perfumes = await getActivePerfumes();
  return (
    perfumes.find((perfume) => {
      const canonicalSlug = buildProductSlug(perfume);
      const legacySlug = resolvePerfumeSlug(perfume);
      return slug === canonicalSlug || slug === legacySlug;
    }) || null
  );
}

export async function generateStaticParams() {
  const perfumes = await getActivePerfumes();
  const uniqueSlugs = Array.from(new Set(perfumes.map((perfume) => buildProductSlug(perfume))));
  return uniqueSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getPerfumeByProductSlug(slug);

  if (!product) {
    return {
      title: `${SITE_NAME} | Perfume Not Found`,
      description: "Browse authentic perfume decants and full bottle requests in Bangladesh.",
    };
  }

  const canonicalSlug = buildProductSlug(product);
  const title = buildProductMetaTitle(product);
  const description = buildProductMetaDescription(product);
  const canonicalPath = `/products/${canonicalSlug}`;
  const keywords = getProductKeywordBundle(product.name);

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath,
    },
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

export default async function ProductPage({ params }: RouteProps) {
  const { slug } = await params;
  const product = await getPerfumeByProductSlug(slug);

  if (!product) notFound();

  const canonicalSlug = buildProductSlug(product);
  if (slug !== canonicalSlug) {
    redirect(`/products/${canonicalSlug}`);
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
  const canonicalUrl = `${SITE_URL}/products/${canonicalSlug}`;

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
      <PerfumePageClient params={Promise.resolve({ id: product.id })} />
    </>
  );
}
