import Link from "next/link";

const BRAND_BLUE = "#1668c2";
const LINE_URL = process.env.NEXT_PUBLIC_LINE_URL ?? "https://line.me/R/ti/p/@864nqqxj";

/** 子頁面共用品牌頁尾（與首頁 footer 一致）。 */
export default function SiteFooter() {
  return (
    <footer
      style={{
        position: "relative",
        zIndex: 1,
        padding: "50px 6vw",
        background: "#f5f5f7",
        borderTop: "1px solid rgba(0,0,0,.07)",
      }}
    >
      <div
        style={{
          maxWidth: 1160,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 18,
        }}
      >
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="給樂數位 Gather logo" width={24} height={24} style={{ width: 24, height: 24, display: "block" }} />
          <span style={{ fontWeight: 600, fontSize: 15, color: "#1d1d1f" }}>Gather</span>
          <span style={{ fontSize: 12, letterSpacing: ".26em", color: "#86868b", marginLeft: 2 }}>給樂數位</span>
        </Link>
        <div style={{ fontSize: 12, color: "#86868b" }}>
          給樂行銷有限公司　·　Copyright © 2026 All rights reserved.
        </div>
        <a
          href={LINE_URL}
          target="_blank"
          rel="noopener"
          className="btn-text"
          style={{ fontSize: 13, color: BRAND_BLUE, textDecoration: "none" }}
        >
          LINE 諮詢 ›
        </a>
      </div>
    </footer>
  );
}
