import type { Metadata } from "next";
import { getBlogBySlug } from "@/lib/seo-content";
import { SeoRichContentPage, buildSeoMetadata } from "@/components/seo/SeoRichContentPage";

const post = getBlogBySlug("decant-vs-full-bottle-which-should-you-buy");

export const metadata: Metadata = buildSeoMetadata(
  "Decant vs Full Bottle Guide | Which Perfume Buying Path Is Better?",
  "A buyer-intent guide for Bangladesh perfume shoppers comparing decants and full bottle purchases.",
  ["decant vs full bottle", "try before buy perfume", "perfume buying guide Bangladesh"],
);

export default async function DecantVsFullBottleGuidePage() {
  if (!post) return null;

  return (
    <SeoRichContentPage
      title={post.title}
      intro={post.excerpt}
      sections={post.sections}
      ctaText="Browse Decants"
      ctaHref="/category/decants"
    />
  );
}
