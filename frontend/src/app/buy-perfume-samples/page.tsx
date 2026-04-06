import type { Metadata } from "next";
import { SeoRichContentPage, buildSeoMetadata } from "@/components/seo/SeoRichContentPage";
import { getLandingBySlug } from "@/lib/seo-content";

const content = getLandingBySlug("buy-perfume-samples");

export const metadata: Metadata = buildSeoMetadata(
  content?.metaTitle || "Buy Perfume Samples",
  content?.metaDescription || "Buy perfume samples in Bangladesh",
  content?.keywordCluster || ["buy perfume samples"],
);

export default async function BuyPerfumeSamplesPage() {
  if (!content) return null;
  return (
    <SeoRichContentPage
      title={content.title}
      intro={content.intro}
      sections={content.sections}
      ctaText="Shop Sample Decants"
      ctaHref="/category/decants"
    />
  );
}
