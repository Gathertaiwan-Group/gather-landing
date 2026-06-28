import Link from "next/link";
import BlogCard from "@/components/BlogCard";
import type { BlogPost } from "@/lib/blog";

const BRAND_BLUE = "#1668c2";

/** 首頁「最新文章」區（server component，slot 進 GatherLanding）。無文章時請勿渲染。 */
export default function LatestPosts({ posts }: { posts: BlogPost[] }) {
  if (!posts.length) return null;
  return (
    <section
      style={{
        position: "relative",
        zIndex: 1,
        padding: "clamp(84px,13vw,140px) 6vw",
        background: "#ffffff",
      }}
    >
      <div style={{ maxWidth: 1160, margin: "0 auto" }}>
        <div
          data-reveal=""
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 16,
            marginBottom: "clamp(38px,7vw,56px)",
          }}
        >
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: ".04em", color: BRAND_BLUE, marginBottom: 16 }}>
              Latest Insights
            </div>
            <h2
              style={{
                margin: 0,
                fontWeight: 700,
                fontSize: "clamp(32px,5vw,64px)",
                lineHeight: 1.06,
                letterSpacing: "-.025em",
                color: "#1d1d1f",
              }}
            >
              最新文章
            </h2>
          </div>
          <Link href="/blog" style={{ fontSize: 16, fontWeight: 500, color: BRAND_BLUE, textDecoration: "none" }}>
            看更多文章 ›
          </Link>
        </div>

        <div
          data-stagger-group=""
          className="gt-blog-grid"
          style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 26 }}
        >
          {posts.map((p) => (
            <div data-reveal="" key={p.id}>
              <BlogCard post={p} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
