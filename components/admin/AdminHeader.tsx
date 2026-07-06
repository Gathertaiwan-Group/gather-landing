"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

const BRAND_BLUE = "#1668c2";

const NAV = [
  { href: "/admin", label: "總覽" },
  { href: "/admin/inquiries", label: "諮詢紀錄" },
  { href: "/admin/cases", label: "案件管理" },
  { href: "/admin/quotes", label: "報價單" },
] as const;

/** 後台固定導覽列（沿用 SiteHeader 視覺；當前頁加粗變藍）。 */
export default function AdminHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  // /admin 只在完全相符時 active；其餘用 startsWith 讓子路徑也 active
  function isActive(href: string) {
    return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
  }

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/admin/login", { method: "DELETE" });
    } catch {
      /* 即使登出請求失敗，仍導回登入頁 */
    }
    router.replace("/admin/login");
  }

  return (
    <nav
      className="gt-nav"
      style={{
        position: "fixed",
        inset: "0 0 auto 0",
        zIndex: 50,
        height: 54,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 6vw",
        background: "rgba(255,255,255,.82)",
        backdropFilter: "saturate(180%) blur(20px)",
        WebkitBackdropFilter: "saturate(180%) blur(20px)",
        borderBottom: "1px solid rgba(0,0,0,.07)",
      }}
    >
      {/* 左：logo + 後台標示 */}
      <Link
        href="/admin"
        style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="給樂數位 Gather logo" width={26} height={26} style={{ width: 26, height: 26, display: "block" }} />
        <span style={{ fontWeight: 700, fontSize: 17, color: "#1d1d1f" }}>後台</span>
        <span style={{ fontSize: 12, color: "#86868b", letterSpacing: ".02em" }}>給樂數位</span>
      </Link>

      {/* 中/右：導覽 + 登出 */}
      <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
        {NAV.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="gt-admin-navlink"
              style={active ? { opacity: 1, color: BRAND_BLUE, fontWeight: 700 } : undefined}
            >
              {item.label}
            </Link>
          );
        })}
        <button
          onClick={logout}
          disabled={loggingOut}
          style={{
            fontSize: 13.5,
            fontWeight: 500,
            color: "#6e6e73",
            background: "transparent",
            border: "1px solid rgba(0,0,0,.14)",
            borderRadius: 980,
            padding: "6px 15px",
            cursor: loggingOut ? "default" : "pointer",
            opacity: loggingOut ? 0.5 : 1,
          }}
        >
          登出
        </button>
      </div>
    </nav>
  );
}
