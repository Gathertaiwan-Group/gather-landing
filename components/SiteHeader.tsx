import Link from "next/link";

const BRAND_BLUE = "#1668c2";
const LINE_URL = process.env.NEXT_PUBLIC_LINE_URL ?? "https://line.me/R/ti/p/@864nqqxj";

/** 部落格等子頁面的品牌導覽列（與首頁 nav 視覺一致；hover 見 globals.css）。 */
export default function SiteHeader() {
  return (
    <nav
      className="gt-nav"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 6vw",
        height: 54,
        background: "rgba(255,255,255,.72)",
        backdropFilter: "saturate(180%) blur(20px)",
        WebkitBackdropFilter: "saturate(180%) blur(20px)",
        borderBottom: "1px solid rgba(0,0,0,.07)",
      }}
    >
      <Link
        href="/"
        style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="給樂數位 Gather logo" width={28} height={28} style={{ width: 28, height: 28, display: "block" }} />
        <span style={{ fontWeight: 600, letterSpacing: ".02em", fontSize: 19, color: "#1d1d1f" }}>
          Gather
        </span>
        <span className="gt-nav-sub" style={{ fontSize: 12, letterSpacing: ".32em", color: "#86868b", marginLeft: 2 }}>
          給樂數位
        </span>
      </Link>
      <div style={{ display: "flex", alignItems: "center", gap: 34 }}>
        <a href="/#about" className="gt-navlink-text" style={navLink}>理念</a>
        <a href="/#services" className="gt-navlink-text" style={navLink}>服務</a>
        <a href="/#work" className="gt-navlink-text" style={navLink}>作品</a>
        <Link href="/blog" className="gt-navlink-text" style={{ ...navLink, opacity: 1, color: BRAND_BLUE }}>
          部落格
        </Link>
        <a
          href={LINE_URL}
          target="_blank"
          rel="noopener"
          className="gt-nav-cta"
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: "#fff",
            background: BRAND_BLUE,
            padding: "7px 17px",
            borderRadius: 980,
            textDecoration: "none",
          }}
        >
          聯絡我們
        </a>
      </div>
    </nav>
  );
}

const navLink = {
  fontSize: 14,
  color: "#1d1d1f",
  textDecoration: "none",
  opacity: 0.82,
} as const;
