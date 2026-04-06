import type { MetadataRoute } from "next";
import { blogPosts, landingPages } from "@/lib/seo-content";
import { SITE_URL, getActivePerfumes, buildCanonicalProductPath } from "@/lib/seo-catalog";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const perfumes = await getActivePerfumes();
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    "",
    "/shop",
    "/category/decants",
    "/category/full-bottles",
    "/guides/decant-vs-full-bottle",
    ...landingPages.map((item) => `/${item.slug}`),
    ...blogPosts.map((item) => `/blog/${item.slug}`),
  ].map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: path === "" ? 1 : 0.8,
  }));

  const productPages: MetadataRoute.Sitemap = perfumes.map((perfume) => ({
    url: `${SITE_URL}${buildCanonicalProductPath(perfume)}`,
    lastModified: now,
    changeFrequency: "daily",
    priority: 0.9,
  }));

  return [...staticPages, ...productPages];
}
