import type { NextConfig } from "next";
// Detect Netlify environment
const isNetlify = process.env.NEXT_PUBLIC_ENV === "netlify";

const nextConfig: NextConfig = {
  // Compress responses with gzip (Brotli handled by CDN/reverse proxy)
  compress: true,

  // Allow Turbopack to use system TLS certificates so Google Fonts can be
  // fetched during the build (required when the build host uses a custom CA).
  experimental: {
    turbopackUseSystemTlsCerts: true,
  },

  // Optimize images
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
    dangerouslyAllowLocalIP: process.env.NODE_ENV !== "production" && !isNetlify,
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },

  // Performance: reduce unused JS from server-only packages
  serverExternalPackages: ["firebase-admin"],

  // Headers for caching and security
  async headers() {
    // Example: Add Netlify-specific headers if needed
    const baseHeaders = [
      {
        source: "/:path*",
        headers: [
          { key: "X-DNS-Prefetch-Control", value: "on" },
        ],
      },
      {
        // Cache static assets aggressively
        source: "/(.*)\\.(js|css|woff2|woff|ttf|ico|svg)$",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        // Cache images for 30 days
        source: "/(.*)\\.(png|jpg|jpeg|gif|webp|avif)$",
        headers: [
          { key: "Cache-Control", value: "public, max-age=2592000, stale-while-revalidate=86400" },
        ],
      },
    ];
    if (isNetlify) {
      // Example: Add Netlify-specific headers here if needed
      // baseHeaders.push({ source: "/netlify/*", headers: [{ key: "X-From-Netlify", value: "true" }] });
    }
    return baseHeaders;
  },
};

export default nextConfig;
