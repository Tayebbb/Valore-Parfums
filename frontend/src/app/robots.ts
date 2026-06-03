import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo-catalog";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/api/",
        "/cart",
        "/checkout",
        "/wishlist",
        "/track",
        "/orders",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
