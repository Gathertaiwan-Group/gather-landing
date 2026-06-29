import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { getPostBySlug, getAllPublishedSlugs } from "@/lib/blog";

export const revalidate = 60;
export const dynamicParams = true;

const BRAND_BLUE = "#1668c2";

export async function generateStaticParams() {
  const slugs = await getAllPublishedSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const post = await getPostBySlug(decodeURIComponent(params.slug));
  if (!post) return { title: "文章不存在 — 給樂數位 Gather" };
  const desc = post.excerpt ?? `${post.title}｜給樂數位 Gather 部落格`;
  return {
    title: `${post.title} — 給樂數位 Gather`,
    description: desc,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title: post.title,
      description: desc,
      type: "article",
      url: `https://gathertaiwan.com/blog/${post.slug}`,
      images: [{ url: post.cover_url ?? "/og.jpg", width: 1200, height: 630 }],
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: { slug: string };
}) {
  const post = await getPostBySlug(decodeURIComponent(params.slug));
  if (!post) notFound();

  return (
    <>
      <SiteHeader />
      <main style={{ position: "relative", zIndex: 1 }}>
        <article style={{ maxWidth: 760, margin: "0 auto", padding: "clamp(110px,16vw,150px) 6vw clamp(80px,12vw,120px)" }}>
          {/* 麵包屑 / 分類 */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, fontSize: 13 }}>
            <Link href="/blog" style={{ color: BRAND_BLUE, textDecoration: "none", fontWeight: 500 }}>
              ‹ 部落格
            </Link>
            {post.category && (
              <span style={{ fontWeight: 600, letterSpacing: ".06em", color: "#ef7d22", textTransform: "uppercase" }}>
                {post.category}
              </span>
            )}
          </div>

          <h1
            style={{
              margin: "0 0 18px",
              fontWeight: 700,
              fontSize: "clamp(30px,4.5vw,52px)",
              lineHeight: 1.18,
              letterSpacing: "-.022em",
              color: "#1d1d1f",
            }}
          >
            {post.title}
          </h1>

          <div style={{ marginBottom: 30, fontSize: 14, color: "#86868b" }}>
            {post.author ?? "給樂數位 Gather"}
          </div>

          {post.cover_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.cover_url}
              alt={post.title}
              style={{ width: "100%", borderRadius: 20, marginBottom: 38, boxShadow: "0 14px 40px rgba(20,40,80,.10)" }}
            />
          )}

          <div className="prose">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
              {post.content ?? ""}
            </ReactMarkdown>
          </div>

          <div style={{ marginTop: 56, paddingTop: 32, borderTop: "1px solid rgba(0,0,0,.08)" }}>
            <Link href="/blog" style={{ color: BRAND_BLUE, textDecoration: "none", fontWeight: 500, fontSize: 16 }}>
              ‹ 回到所有文章
            </Link>
          </div>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
