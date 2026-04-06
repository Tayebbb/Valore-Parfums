import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SeoRichContentPage, buildSeoMetadata } from "@/components/seo/SeoRichContentPage";
import { blogPosts, getBlogBySlug } from "@/lib/seo-content";

export async function generateStaticParams() {
  return blogPosts.map((post) => ({ postSlug: post.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ postSlug: string }> }): Promise<Metadata> {
  const { postSlug } = await params;
  const post = getBlogBySlug(postSlug);
  if (!post) return {};

  return buildSeoMetadata(post.title, post.metaDescription, post.keywordCluster);
}

export default async function BlogPostPage({ params }: { params: Promise<{ postSlug: string }> }) {
  const { postSlug } = await params;
  const post = getBlogBySlug(postSlug);
  if (!post) notFound();

  return (
    <SeoRichContentPage
      title={post.title}
      intro={post.excerpt}
      sections={post.sections}
      ctaText="Shop Perfume Decants"
      ctaHref="/category/decants"
    />
  );
}
