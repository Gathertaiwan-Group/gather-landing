import GatherLanding from "@/components/GatherLanding";
import LatestPosts from "@/components/LatestPosts";
import { getProjects } from "@/lib/projects";
import { getPublishedPosts } from "@/lib/blog";

// 作品集/文章可能來自 Supabase，避免靜態快取過久；每 5 分鐘重新驗證一次。
export const revalidate = 300;

export default async function Page() {
  const [projects, posts] = await Promise.all([
    getProjects(),
    getPublishedPosts({ limit: 3 }),
  ]);

  // LatestPosts 為 server component，以 slot 傳入 client 的 GatherLanding，
  // 避免把 Supabase 資料層打包進前端 bundle。
  return (
    <GatherLanding
      projects={projects}
      latestPosts={posts.length ? <LatestPosts posts={posts} /> : null}
    />
  );
}
