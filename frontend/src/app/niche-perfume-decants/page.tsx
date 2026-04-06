import type { Metadata } from "next";
import { SeoRichContentPage, buildSeoMetadata } from "@/components/seo/SeoRichContentPage";
import { getLandingBySlug } from "@/lib/seo-content";

const content = getLandingBySlug("niche-perfume-decants");

export const metadata: Metadata = buildSeoMetadata(
  content?.metaTitle || "Niche Perfume Decants",
  content?.metaDescription || "Niche perfume decants in Bangladesh",
  content?.keywordCluster || ["niche perfume decants"],
);

export default async function NichePerfumeDecantsPage() {
  if (!content) return null;
  return (
    <SeoRichContentPage
      title={content.title}
      intro={content.intro}
      sections={content.sections}
      ctaText="Explore Niche Decants"
      ctaHref="/shop"
    />
  );
}
