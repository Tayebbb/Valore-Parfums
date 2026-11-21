import type { MetadataRoute } from "next";
import { blogPosts, landingPages } from "@/lib/seo-content";
import { SITE_URL, getActivePerfumes, buildCanonicalProductPath } from "@/lib/seo-catalog";
import { getPublicPacks } from "@/lib/packs-api";

export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [perfumes, packs] = await Promise.all([getActivePerfumes(), getPublicPacks()]);
  const brands = new Set(perfumes.map((p) => p.brandSlug).filter(Boolean));

  const staticPages: MetadataRoute.Sitemap = [
    "",
    "/shop",
    "/packs",
    "/category/decants",
    "/category/full-bottles",
    "/blog",
    "/sterile-decant-process",
    ...Array.from(brands, (brand) => `/brand/${brand}`),
    ...landingPages.map((item) => `/${item.slug}`),
    ...blogPosts.map((item) => `/blog/${item.slug}`),
  ].map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: "weekly",
    priority: path === "" ? 1 : 0.8,
  }));

  const productPages: MetadataRoute.Sitemap = perfumes.map((perfume) => ({
    url: `${SITE_URL}${buildCanonicalProductPath(perfume)}`,
    changeFrequency: "daily",
    priority: 0.9,
  }));

  const packPages: MetadataRoute.Sitemap = packs.map((pack) => ({
    url: `${SITE_URL}/packs/${pack.slug}`,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...staticPages, ...productPages, ...packPages];
}
