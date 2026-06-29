import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gathertaiwan.com";

/** 驗證 Authorization: Bearer <BLOG_API_TOKEN>。 */
function authorize(req: Request): boolean {
  const expected = process.env.BLOG_API_TOKEN;
  if (!expected) return false; // 未設定 token → 一律拒絕（fail-safe）
  const header = req.headers.get("authorization") ?? "";
  const got = header.replace(/^Bearer\s+/i, "").trim();
  return got.length > 0 && got === expected;
}

/** title → slug：保留英數與中日韓字元，其餘轉連字號。 */
function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^\p{Script=Han}a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base || "post";
}

function unauthorized() {
  return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** 用 Pexels 依關鍵字抓一張橫向情境照（含攝影師標註）。未設 key 或失敗回 null。 */
async function fetchPexelsCover(
  query: string
): Promise<{ url: string; credit: string; creditUrl: string } | null> {
  const key = process.env.PEXELS_API_KEY;
  if (!key || !query.trim()) return null;
  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=landscape&per_page=10`,
      { headers: { Authorization: key, "User-Agent": UA } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      photos?: Array<{ src: { original: string }; photographer: string; url: string }>;
    };
    const photo = data.photos?.[0];
    if (!photo) return null;
    return {
      url: `${photo.src.original}?auto=compress&cs=tinysrgb&fit=crop&w=1600&h=1000`,
      credit: `Photo by ${photo.photographer} on Pexels`,
      creditUrl: photo.url,
    };
  } catch {
    return null;
  }
}

// ── 建立文章 ──
export async function POST(req: Request) {
  if (!authorize(req)) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const title = String(body.title ?? "").trim();
  const content = String(body.content ?? "").trim();
  if (!title || !content) {
    return NextResponse.json(
      { ok: false, error: "missing_fields", detail: "title 與 content 為必填" },
      { status: 422 }
    );
  }

  const supabase = createAdminSupabase();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "supabase_not_configured" },
      { status: 503 }
    );
  }

  const baseSlug = body.slug ? slugify(String(body.slug)) : slugify(title);

  // 封面：若未提供 cover_url，依 cover_query（或 title）自動向 Pexels 抓情境圖 + 標註
  let cover_url = body.cover_url ? String(body.cover_url) : null;
  let cover_credit = body.cover_credit ? String(body.cover_credit) : null;
  let cover_credit_url = body.cover_credit_url ? String(body.cover_credit_url) : null;
  if (!cover_url) {
    const pic = await fetchPexelsCover(body.cover_query ? String(body.cover_query) : title);
    if (pic) {
      cover_url = pic.url;
      cover_credit = pic.credit;
      cover_credit_url = pic.creditUrl;
    }
  }

  const row = {
    title,
    content,
    excerpt: body.excerpt ? String(body.excerpt) : null,
    cover_url,
    cover_credit,
    cover_credit_url,
    category: body.category ? String(body.category) : null,
    author: body.author ? String(body.author) : "給樂數位 Gather",
    published: body.published === undefined ? true : Boolean(body.published),
    published_at: body.published_at ? String(body.published_at) : new Date().toISOString(),
  };

  // slug 碰撞時自動加 -2、-3…
  let slug = baseSlug;
  let inserted: { id: string; slug: string } | null = null;
  for (let attempt = 1; attempt <= 6; attempt++) {
    const { data, error } = await supabase
      .from("blog_posts")
      .insert({ ...row, slug })
      .select("id, slug")
      .single();
    if (!error && data) {
      inserted = data as { id: string; slug: string };
      break;
    }
    if (error && (error as { code?: string }).code === "23505") {
      slug = `${baseSlug}-${attempt + 1}`;
      continue; // slug 重複，換一個再試
    }
    return NextResponse.json(
      { ok: false, error: "db_error", detail: error?.message },
      { status: 500 }
    );
  }
  if (!inserted) {
    return NextResponse.json({ ok: false, error: "slug_conflict" }, { status: 409 });
  }

  revalidatePath("/blog");
  revalidatePath("/");
  revalidatePath(`/blog/${inserted.slug}`);

  return NextResponse.json(
    {
      ok: true,
      id: inserted.id,
      slug: inserted.slug,
      url: `${SITE_URL}/blog/${inserted.slug}`,
    },
    { status: 201 }
  );
}

// ── 更新 / 下架文章（依 id 或 slug）──
export async function PATCH(req: Request) {
  if (!authorize(req)) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const id = body.id ? String(body.id) : null;
  const targetSlug = body.slug ? String(body.slug) : null;
  if (!id && !targetSlug) {
    return NextResponse.json(
      { ok: false, error: "missing_identifier", detail: "需提供 id 或 slug" },
      { status: 422 }
    );
  }

  const supabase = createAdminSupabase();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });
  }

  const patch: Record<string, unknown> = {};
  for (const k of ["title", "content", "excerpt", "cover_url", "cover_credit", "cover_credit_url", "category", "author", "published", "published_at"]) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "nothing_to_update" }, { status: 422 });
  }

  const q = supabase.from("blog_posts").update(patch);
  const { data, error } = await (id ? q.eq("id", id) : q.eq("slug", targetSlug!))
    .select("id, slug")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: "db_error", detail: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  revalidatePath("/blog");
  revalidatePath("/");
  revalidatePath(`/blog/${data.slug}`);
  return NextResponse.json({ ok: true, id: data.id, slug: data.slug });
}

// ── 列出最近文章（供 agent 檢查重複 slug）──
export async function GET(req: Request) {
  if (!authorize(req)) return unauthorized();
  const supabase = createAdminSupabase();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });
  }
  const { data, error } = await supabase
    .from("blog_posts")
    .select("id, slug, title, category, published, published_at, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, posts: data });
}
