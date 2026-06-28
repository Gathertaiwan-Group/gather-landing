import type { MetadataRoute } from "next";
import { getPublishedPosts } from "@/lib/blog";

const BASE = "https://gathertaiwan.com";

export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getPublishedPosts();
  const postEntries: MetadataRoute.Sitemap = posts.map((p) => ({
    url: `${BASE}/blog/${p.slug}`,
    lastModified: new Date(p.published_at ?? p.created_at),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [
    { url: BASE, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/blog`, changeFrequency: "daily", priority: 0.8 },
    ...postEntries,
  ];
}
