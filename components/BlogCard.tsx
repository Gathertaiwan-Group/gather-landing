import Link from "next/link";
import type { BlogPost } from "@/lib/blog";

const BRAND_BLUE = "#1668c2";

/** 文章卡：/blog 列表與首頁「最新文章」區共用。hover 效果見 globals.css .gt-blog-card */
export default function BlogCard({ post }: { post: BlogPost }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="gt-blog-card"
      style={{
        display: "block",
        textDecoration: "none",
        background: "#fff",
        borderRadius: 24,
        overflow: "hidden",
        boxShadow: "0 8px 30px rgba(20,40,80,.07)",
      }}
    >
      <div
        style={{
          aspectRatio: "16 / 10",
          position: "relative",
          background: "linear-gradient(135deg,#eef1f5,#f6f7f9)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {post.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.cover_url}
            alt={post.title}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <span
            style={{
              padding: "0 24px",
              textAlign: "center",
              fontWeight: 700,
              fontSize: 20,
              letterSpacing: "-.01em",
              color: "#9aa3b0",
            }}
          >
            {post.title}
          </span>
        )}
      </div>
      <div style={{ padding: "22px 24px 26px" }}>
        {post.category && (
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: ".08em",
              color: "#ef7d22",
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            {post.category}
          </div>
        )}
        <h3
          style={{
            margin: "0 0 10px",
            fontWeight: 700,
            fontSize: 21,
            lineHeight: 1.35,
            letterSpacing: "-.01em",
            color: "#1d1d1f",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {post.title}
        </h3>
        {post.excerpt && (
          <p
            style={{
              margin: 0,
              fontSize: 15,
              lineHeight: 1.7,
              color: "#6e6e73",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {post.excerpt}
          </p>
        )}
        <span
          style={{
            display: "inline-block",
            marginTop: 16,
            fontSize: 14,
            fontWeight: 500,
            color: BRAND_BLUE,
          }}
        >
          閱讀文章 ›
        </span>
      </div>
    </Link>
  );
}
