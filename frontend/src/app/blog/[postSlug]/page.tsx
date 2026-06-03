import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SeoRichContentPage, buildSeoMetadata } from "@/components/seo/SeoRichContentPage";
import { blogPosts, getBlogBySlug } from "@/lib/seo-content";
import { SITE_URL } from "@/lib/seo-catalog";

export async function generateStaticParams() {
  return blogPosts.map((post) => ({ postSlug: post.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ postSlug: string }> }): Promise<Metadata> {
  const { postSlug } = await params;
  const post = getBlogBySlug(postSlug);
  if (!post) return {};

  return buildSeoMetadata(post.title, post.metaDescription, post.keywordCluster, `/blog/${postSlug}`);
}

export default async function BlogPostPage({ params }: { params: Promise<{ postSlug: string }> }) {
  const { postSlug } = await params;
  const post = getBlogBySlug(postSlug);
  if (!post) notFound();

  const blogPostingSchema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.metaDescription,
    url: `${SITE_URL}/blog/${postSlug}`,
    author: {
      "@type": "Organization",
      name: "Valore Parfums",
      url: SITE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: "Valore Parfums",
      url: SITE_URL,
      logo: { "@type": "ImageObject", url: `${SITE_URL}/valore-logo.png` },
    },
    image: `${SITE_URL}/valore-logo.png`,
    mainEntityOfPage: { "@type": "WebPage", "@id": `${SITE_URL}/blog/${postSlug}` },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(blogPostingSchema) }} />
      <SeoRichContentPage
        title={post.title}
        intro={post.excerpt}
        sections={post.sections}
        ctaText="Shop Perfume Decants"
        ctaHref="/category/decants"
      />
    </>
  );
}
