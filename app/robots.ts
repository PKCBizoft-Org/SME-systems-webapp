import type { MetadataRoute } from "next";

// Search engines may read the public pages; staff and account pages stay out
// of search results (they need a sign-in anyway).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/account",
        "/accounting",
        "/clients",
        "/insights",
        "/inventory",
        "/users",
        "/ratings",
        "/set-password",
        "/open-app",
      ],
    },
    sitemap: "https://bizoftph.com/sitemap.xml",
  };
}
