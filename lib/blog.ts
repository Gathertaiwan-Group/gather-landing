import { createServerSupabase } from "@/lib/supabase";

export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string | null;
  cover_url: string | null;
  category: string | null;
  author: string | null;
  published_at: string | null;
  created_at: string;
};

export const BLOG_CATEGORIES = ["數位行銷", "AI 賦能"] as const;

const SELECT_COLS =
  "id, slug, title, excerpt, content, cover_url, category, author, published_at, created_at";

/**
 * 已發佈文章列表。
 * 只回傳 published=true 且 published_at 已到期（未來時間 = 排程未上線）。
 * 未設定 Supabase / 出錯 → 回空陣列（部落格沒有 fallback 內容）。
 */
export async function getPublishedPosts(opts?: {
  category?: string;
  limit?: number;
}): Promise<BlogPost[]> {
  const supabase = createServerSupabase();
  if (!supabase) return [];

  try {
    let query = supabase
      .from("blog_posts")
      .select(SELECT_COLS)
      .eq("published", true)
      .or(`published_at.is.null,published_at.lte.${new Date().toISOString()}`)
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (opts?.category) query = query.eq("category", opts.category);
    if (opts?.limit) query = query.limit(opts.limit);

    const { data, error } = await query;
    if (error || !data) return [];
    return data as BlogPost[];
  } catch {
    return [];
  }
}

/** 單篇已發佈文章；找不到回 null。 */
export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  const supabase = createServerSupabase();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from("blog_posts")
      .select(SELECT_COLS)
      .eq("published", true)
      .eq("slug", slug)
      .or(`published_at.is.null,published_at.lte.${new Date().toISOString()}`)
      .maybeSingle();

    if (error || !data) return null;
    return data as BlogPost;
  } catch {
    return null;
  }
}

/** 所有已發佈 slug，給 generateStaticParams 用。 */
export async function getAllPublishedSlugs(): Promise<string[]> {
  const supabase = createServerSupabase();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("blog_posts")
      .select("slug")
      .eq("published", true);
    if (error || !data) return [];
    return data.map((r) => r.slug as string);
  } catch {
    return [];
  }
}

/** 格式化日期：2026-06-29 → 2026.06.29 */
export function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}
