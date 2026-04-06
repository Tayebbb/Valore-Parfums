import type { Metadata } from "next";
import { SeoRichContentPage, buildSeoMetadata } from "@/components/seo/SeoRichContentPage";
import { getLandingBySlug } from "@/lib/seo-content";

const content = getLandingBySlug("decants-bangladesh");

export const metadata: Metadata = buildSeoMetadata(
  content?.metaTitle || "Perfume Decants Bangladesh",
  content?.metaDescription || "Authentic perfume decants in Bangladesh",
  content?.keywordCluster || ["perfume decant bangladesh"],
);

export default async function DecantsBangladeshPage() {
  if (!content) return null;
  return (
    <SeoRichContentPage
      title={content.title}
      intro={content.intro}
      sections={content.sections}
      ctaText="Explore Decants"
      ctaHref="/category/decants"
    />
  );
}
