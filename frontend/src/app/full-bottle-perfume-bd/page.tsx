import type { Metadata } from "next";
import { SeoRichContentPage, buildSeoMetadata } from "@/components/seo/SeoRichContentPage";
import { getLandingBySlug } from "@/lib/seo-content";

const content = getLandingBySlug("full-bottle-perfume-bd");

export const metadata: Metadata = buildSeoMetadata(
  content?.metaTitle || "Full Bottle Perfume BD",
  content?.metaDescription || "Request full bottle perfume in Bangladesh",
  content?.keywordCluster || ["full bottle perfume bangladesh"],
);

export default async function FullBottlePerfumeBdPage() {
  if (!content) return null;
  return (
    <SeoRichContentPage
      title={content.title}
      intro={content.intro}
      sections={content.sections}
      ctaText="Request Full Bottle"
      ctaHref="/category/full-bottles"
    />
  );
}
