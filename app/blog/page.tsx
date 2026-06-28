import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import BlogCard from "@/components/BlogCard";
import { getPublishedPosts, BLOG_CATEGORIES } from "@/lib/blog";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "部落格 — 給樂數位 Gather",
  description:
    "給樂數位部落格：數位行銷與 AI 賦能的實戰觀點、客製化網站與系統整合心法。",
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "部落格 — 給樂數位 Gather",
    description: "數位行銷與 AI 賦能的實戰觀點。",
    type: "website",
    url: "https://gathertaiwan.com/blog",
    images: [{ url: "/og.jpg", width: 1200, height: 630 }],
  },
};

const BRAND_BLUE = "#1668c2";

export default async function BlogIndex({
  searchParams,
}: {
  searchParams: { cat?: string };
}) {
  const activeCat = searchParams.cat;
  const posts = await getPublishedPosts(
    activeCat ? { category: activeCat } : undefined
  );

  const chips = ["全部", ...BLOG_CATEGORIES];

  return (
    <>
      <SiteHeader />
      <main style={{ position: "relative", zIndex: 1 }}>
        {/* 標題區 */}
        <section style={{ padding: "clamp(120px,18vw,160px) 6vw clamp(40px,7vw,56px)", textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: ".04em", color: BRAND_BLUE, marginBottom: 18 }}>
            Insights
          </div>
          <h1
            style={{
              margin: 0,
              fontWeight: 700,
              fontSize: "clamp(36px,5.5vw,72px)",
              lineHeight: 1.08,
              letterSpacing: "-.025em",
              color: "#1d1d1f",
            }}
          >
            部落格
          </h1>
          <p style={{ margin: "20px auto 0", maxWidth: 520, fontSize: 17, lineHeight: 1.7, color: "#6e6e73" }}>
            數位行銷與 AI 賦能的實戰觀點，陪品牌一起成長。
          </p>

          {/* 分類篩選 */}
          <div style={{ marginTop: 34, display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 12 }}>
            {chips.map((c) => {
              const isActive = c === "全部" ? !activeCat : activeCat === c;
              const href = c === "全部" ? "/blog" : `/blog?cat=${encodeURIComponent(c)}`;
              return (
                <Link
                  key={c}
                  href={href}
                  style={{
                    fontSize: 15,
                    fontWeight: 500,
                    padding: "8px 20px",
                    borderRadius: 980,
                    textDecoration: "none",
                    border: "1px solid",
                    borderColor: isActive ? BRAND_BLUE : "rgba(0,0,0,.12)",
                    background: isActive ? BRAND_BLUE : "transparent",
                    color: isActive ? "#fff" : "#1d1d1f",
                  }}
                >
                  {c}
                </Link>
              );
            })}
          </div>
        </section>

        {/* 文章網格 / 空狀態 */}
        <section style={{ padding: "0 6vw clamp(96px,16vw,160px)" }}>
          <div style={{ maxWidth: 1160, margin: "0 auto" }}>
            {posts.length === 0 ? (
              <div style={{ textAlign: "center", padding: "80px 0", color: "#86868b" }}>
                <p style={{ fontSize: 18, margin: 0 }}>文章即將推出，敬請期待。</p>
              </div>
            ) : (
              <div className="gt-blog-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 26 }}>
                {posts.map((p) => (
                  <BlogCard key={p.id} post={p} />
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
