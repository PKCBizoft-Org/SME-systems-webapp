import type { MetadataRoute } from "next";

// The public pages we want Google and Bing to list.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://bizoftph.com";
  const pages: { path: string; priority: number }[] = [
    { path: "", priority: 1 },
    { path: "/who-we-are", priority: 0.8 },
    { path: "/download", priority: 0.8 },
    { path: "/guide", priority: 0.6 },
    { path: "/login", priority: 0.5 },
    { path: "/privacy", priority: 0.3 },
    { path: "/terms", priority: 0.3 },
    { path: "/cookies", priority: 0.3 },
  ];
  return pages.map(({ path, priority }) => ({
    url: `${base}${path}`,
    changeFrequency: "monthly",
    priority,
  }));
}
