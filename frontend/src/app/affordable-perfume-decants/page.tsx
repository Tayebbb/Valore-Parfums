import type { Metadata } from "next";
import { SeoRichContentPage, buildSeoMetadata } from "@/components/seo/SeoRichContentPage";
import { getLandingBySlug } from "@/lib/seo-content";

const content = getLandingBySlug("affordable-perfume-decants");

export const metadata: Metadata = buildSeoMetadata(
  content?.metaTitle || "Affordable Perfume Decants",
  content?.metaDescription || "Affordable authentic decants in Bangladesh",
  content?.keywordCluster || ["affordable perfume decants"],
);

export default async function AffordablePerfumeDecantsPage() {
  if (!content) return null;
  return (
    <SeoRichContentPage
      title={content.title}
      intro={content.intro}
      sections={content.sections}
      ctaText="Browse Affordable Decants"
      ctaHref="/shop?sort=price-asc"
    />
  );
}
