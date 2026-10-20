import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Smaller images for phones: AVIF first, WebP as the fallback.
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
  async headers() {
    return [
      {
        // Files in public/ (logo, photos, videos, icons) keep their names when replaced, so they are not
        // "immutable": browsers and the CDN keep them a day, then quietly refresh in the background for a week.
        // (/_next/ files already get a one-year immutable cache from Next.js; leave those alone.)
        source: "/:file((?!_next/|api/).*\\.(?:svg|jpg|jpeg|png|webp|avif|gif|ico|mp4|webm|woff2))",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
        ],
      },
    ];
  },
};

export default nextConfig;
