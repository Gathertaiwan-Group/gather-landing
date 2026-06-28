import GatherLanding from "@/components/GatherLanding";
import { getProjects } from "@/lib/projects";

// 作品集可能來自 Supabase，避免靜態快取過久；每 5 分鐘重新驗證一次。
export const revalidate = 300;

export default async function Page() {
  const projects = await getProjects();
  const lineUrl =
    process.env.NEXT_PUBLIC_LINE_URL ?? "https://line.me/R/ti/p/@864nqqxj";

  return <GatherLanding projects={projects} lineUrl={lineUrl} />;
}
