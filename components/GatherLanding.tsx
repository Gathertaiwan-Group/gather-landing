"use client";

import { useEffect, type CSSProperties } from "react";
import type { Project } from "@/lib/projects";

/* ============================================================
   給樂數位 Gather 官網 — 由 reference-build/index.html 逐項移植。
   所有顏色 / 字級 / 間距 / 圓角 / 陰影 / 動效數值皆與設計定稿一致。
   作品集資料由 props 傳入（Supabase 或內建 fallback）。
   進場揭開 / stagger / 主視覺微縮放 / 理念逐字點亮 / 光暈漂移
   全部由單一 requestAnimationFrame 迴圈驅動（見 useEffect）。
   ============================================================ */

const BRAND_BLUE = "#1668c2";
const BRAND_BLUE_DARK = "#0f56a6";

// ── hover 行為（對應 reference 的 hovers()）──
const onNavlinkEnter = (e: React.MouseEvent<HTMLElement>) => {
  e.currentTarget.style.opacity = "1";
};
const onNavlinkLeave = (e: React.MouseEvent<HTMLElement>) => {
  e.currentTarget.style.opacity = ".82";
};
const onPrimaryEnter = (e: React.MouseEvent<HTMLElement>) => {
  e.currentTarget.style.background = BRAND_BLUE_DARK;
  e.currentTarget.style.transform = "translateY(-2px)";
};
const onPrimaryLeave = (e: React.MouseEvent<HTMLElement>) => {
  e.currentTarget.style.background = BRAND_BLUE;
  e.currentTarget.style.transform = "none";
};
const onTextEnter = (e: React.MouseEvent<HTMLElement>) => {
  e.currentTarget.style.opacity = ".6";
};
const onTextLeave = (e: React.MouseEvent<HTMLElement>) => {
  e.currentTarget.style.opacity = "1";
};

export default function GatherLanding({
  projects,
  lineUrl,
}: {
  projects: Project[];
  lineUrl: string;
}) {
  useEffect(() => {
    let rafId = 0;

    // 每組 data-stagger-group 內的 data-reveal 依序錯開 90ms
    document.querySelectorAll<HTMLElement>("[data-stagger-group]").forEach((g) => {
      g.querySelectorAll<HTMLElement>("[data-reveal]").forEach((c, i) => {
        c.dataset.sdelay = String(i * 90);
      });
    });
    document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => {
      el.style.transition = "none";
      el.style.willChange = "opacity, transform";
    });

    // 理念大字拆成逐字 span（idempotent）
    document.querySelectorAll<HTMLElement>("[data-words]").forEach((el) => {
      const anyEl = el as HTMLElement & { _units?: HTMLSpanElement[] };
      if (el.childElementCount > 0) return;
      const text = el.textContent ?? "";
      el.textContent = "";
      const frag = document.createDocumentFragment();
      const units: HTMLSpanElement[] = [];
      let buf = "";
      const isLatin = (ch: string) => /[A-Za-z0-9]/.test(ch);
      const mk = (t: string) => {
        const s = document.createElement("span");
        s.textContent = t;
        s.style.color = "#c7c7cc";
        frag.appendChild(s);
        units.push(s);
      };
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (isLatin(ch) || ch === " ") {
          buf += ch;
          continue;
        }
        if (buf) {
          mk(buf);
          buf = "";
        }
        mk(ch);
      }
      if (buf) mk(buf);
      el.appendChild(frag);
      anyEl._units = units;
    });

    const tick = () => {
      const now = performance.now();
      const h = window.innerHeight;

      document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((raw) => {
        const el = raw as HTMLElement & {
          _seenAt?: number | null;
          _done?: boolean;
        };
        if (el._done) return; // 揭開完成後交還 hover 控制權
        if (el._seenAt == null) {
          const r = el.getBoundingClientRect();
          if (r.bottom > 0 && r.top < h * 0.9) {
            el._seenAt = now + parseFloat(el.dataset.sdelay || "0");
          } else {
            el.style.opacity = "0";
            el.style.transform = "translateY(40px) scale(.97)";
            el.style.filter = "blur(6px)";
            return;
          }
        }
        const p = Math.max(0, Math.min(1, (now - (el._seenAt as number)) / 850));
        const e = 1 - Math.pow(1 - p, 3); // easeOutCubic
        el.style.opacity = e.toFixed(3);
        el.style.transform =
          "translateY(" +
          ((1 - e) * 40).toFixed(2) +
          "px) scale(" +
          (0.97 + 0.03 * e).toFixed(4) +
          ")";
        el.style.filter = p < 1 ? "blur(" + ((1 - e) * 6).toFixed(2) + "px)" : "none";
        if (p >= 1) {
          el.style.transform = "none";
          el.style.filter = "none";
          el.style.opacity = "1";
          el._done = true;
        }
      });

      document.querySelectorAll<HTMLElement>("[data-scroll-scale]").forEach((el) => {
        const r = el.getBoundingClientRect();
        const center = r.top + r.height / 2;
        const d = Math.min(Math.abs(center - h / 2) / h, 1);
        el.style.transform = "scale(" + (0.972 + (1 - d) * 0.04).toFixed(4) + ")";
      });

      document.querySelectorAll<HTMLElement>("[data-words]").forEach((raw) => {
        const el = raw as HTMLElement & { _units?: HTMLSpanElement[] };
        const units = el._units;
        if (!units) return;
        const r = el.getBoundingClientRect();
        const start = h * 0.82;
        const end = h * 0.34;
        let p = (start - r.top) / (start - end);
        p = Math.max(0, Math.min(1, p));
        const lit = Math.round(p * units.length);
        for (let i = 0; i < units.length; i++) {
          const c = i < lit ? "#1d1d1f" : "#c7c7cc";
          if (units[i].style.color !== c) units[i].style.color = c;
        }
      });

      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <>
      {/* ============ NAV ============ */}
      <nav
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
        <a
          href="#top"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            textDecoration: "none",
          }}
        >
          <span
            style={{
              width: 9,
              height: 9,
              background: "linear-gradient(135deg,#1668c2,#ef7d22)",
              borderRadius: 2,
              transform: "rotate(45deg)",
              display: "inline-block",
            }}
          />
          <span
            style={{
              fontWeight: 600,
              letterSpacing: ".02em",
              fontSize: 19,
              color: "#1d1d1f",
            }}
          >
            Gather
          </span>
          <span
            className="gt-nav-sub"
            style={{
              fontSize: 12,
              letterSpacing: ".32em",
              color: "#86868b",
              marginLeft: 2,
            }}
          >
            給樂數位
          </span>
        </a>
        <div style={{ display: "flex", alignItems: "center", gap: 34 }}>
          <a
            href="#about"
            className="gt-navlink-text"
            onMouseEnter={onNavlinkEnter}
            onMouseLeave={onNavlinkLeave}
            style={{ fontSize: 14, color: "#1d1d1f", textDecoration: "none", opacity: 0.82 }}
          >
            理念
          </a>
          <a
            href="#services"
            className="gt-navlink-text"
            onMouseEnter={onNavlinkEnter}
            onMouseLeave={onNavlinkLeave}
            style={{ fontSize: 14, color: "#1d1d1f", textDecoration: "none", opacity: 0.82 }}
          >
            服務
          </a>
          <a
            href="#work"
            className="gt-navlink-text"
            onMouseEnter={onNavlinkEnter}
            onMouseLeave={onNavlinkLeave}
            style={{ fontSize: 14, color: "#1d1d1f", textDecoration: "none", opacity: 0.82 }}
          >
            作品
          </a>
          <a
            href={lineUrl}
            target="_blank"
            rel="noopener"
            onMouseEnter={onPrimaryEnter}
            onMouseLeave={onPrimaryLeave}
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

      {/* ============ HERO ============ */}
      <header
        id="top"
        style={{ position: "relative", zIndex: 1, padding: "170px 6vw 90px", textAlign: "center" }}
      >
        <div data-stagger-group="" style={{ maxWidth: 1000, margin: "0 auto" }}>
          <div
            data-reveal=""
            style={{
              fontSize: 19,
              fontWeight: 600,
              letterSpacing: ".02em",
              color: BRAND_BLUE,
              marginBottom: 20,
            }}
          >
            給樂數位　·　AI 賦能
          </div>
          <h1
            data-reveal=""
            style={{
              margin: 0,
              fontWeight: 700,
              fontSize: "clamp(46px,7.4vw,104px)",
              lineHeight: 1.05,
              letterSpacing: "-.028em",
              color: "#1d1d1f",
            }}
          >
            為每個品牌，<br />
            打造專屬的
            <span
              style={{
                background: "linear-gradient(110deg,#1668c2 10%,#ef7d22 90%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              數位資產
            </span>
            。
          </h1>
          <p
            data-reveal=""
            style={{
              margin: "30px auto 0",
              maxWidth: 680,
              fontSize: "clamp(18px,2.1vw,23px)",
              lineHeight: 1.6,
              fontWeight: 400,
              color: "#6e6e73",
            }}
          >
            客製化網站、AI 賦能的 CRM 系統、金流物流與電子發票串接——讓智慧技術與精緻設計精準結合，一站到位。
          </p>
          <div
            data-reveal=""
            style={{
              marginTop: 34,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 30,
              flexWrap: "wrap",
            }}
          >
            <a
              href={lineUrl}
              target="_blank"
              rel="noopener"
              onMouseEnter={onPrimaryEnter}
              onMouseLeave={onPrimaryLeave}
              style={{
                fontSize: 17,
                fontWeight: 500,
                color: "#fff",
                background: BRAND_BLUE,
                padding: "13px 30px",
                borderRadius: 980,
                textDecoration: "none",
              }}
            >
              預約諮詢
            </a>
            <a
              href="#services"
              onMouseEnter={onTextEnter}
              onMouseLeave={onTextLeave}
              style={{ fontSize: 17, fontWeight: 500, color: BRAND_BLUE, textDecoration: "none" }}
            >
              了解服務 ›
            </a>
          </div>
        </div>
        <div data-reveal="" style={{ maxWidth: 1120, margin: "72px auto 0" }}>
          <div
            data-scroll-scale=""
            style={{
              aspectRatio: "16 / 8",
              borderRadius: 30,
              overflow: "hidden",
              boxShadow: "0 30px 70px rgba(20,40,80,.14)",
              background: "linear-gradient(135deg,#eef2f7,#f6f7f9)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
              transformOrigin: "center",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/hero.jpg"
              alt="給樂數位精選作品 — 客製化網站案例"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "center",
              }}
            />
          </div>
        </div>
      </header>

      {/* ============ ABOUT (scroll word-brighten) ============ */}
      <section
        id="about"
        style={{
          position: "relative",
          zIndex: 1,
          padding: "170px 6vw",
          scrollMarginTop: 60,
          textAlign: "center",
          background: "#f5f5f7",
        }}
      >
        <div style={{ maxWidth: 1020, margin: "0 auto" }}>
          <div
            data-reveal=""
            style={{
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: ".04em",
              color: BRAND_BLUE,
              marginBottom: 30,
            }}
          >
            Our Philosophy
          </div>
          <h2
            data-words=""
            style={{
              margin: 0,
              color: "#c7c7cc",
              fontWeight: 700,
              fontSize: "clamp(28px,4vw,54px)",
              lineHeight: 1.4,
              letterSpacing: "-.02em",
            }}
          >
            我們不只交付網站，而是交付一套由 AI 賦能、值得被信賴、能隨品牌持續成長的數位系統。當智慧技術與精緻設計結合，品牌的價值不只是相加，而是相乘。
          </h2>
        </div>
      </section>

      {/* ============ SERVICES (BENTO) ============ */}
      <section
        id="services"
        style={{ position: "relative", zIndex: 1, padding: "140px 6vw", scrollMarginTop: 60 }}
      >
        <div style={{ maxWidth: 1160, margin: "0 auto" }}>
          <div data-reveal="" style={{ textAlign: "center", marginBottom: 64 }}>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                letterSpacing: ".04em",
                color: BRAND_BLUE,
                marginBottom: 20,
              }}
            >
              Our Services
            </div>
            <h2
              style={{
                margin: 0,
                fontWeight: 700,
                fontSize: "clamp(36px,5vw,72px)",
                lineHeight: 1.06,
                letterSpacing: "-.025em",
                color: "#1d1d1f",
              }}
            >
              完整的數位化能力
            </h2>
            <p
              style={{
                margin: "22px auto 0",
                maxWidth: 560,
                fontSize: 18,
                lineHeight: 1.7,
                color: "#6e6e73",
              }}
            >
              七項以 AI 賦能的核心服務，覆蓋品牌數位化的完整旅程。
            </p>
          </div>

          <div
            data-stagger-group=""
            className="gt-services-grid"
            style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 20 }}
          >
            {/* 01 客製化網站建置（深色大卡，藍光暈） */}
            <div
              data-reveal=""
              style={{
                gridColumn: "span 3",
                minHeight: 380,
                borderRadius: 30,
                padding: 42,
                display: "flex",
                flexDirection: "column",
                background: "#1d1d1f",
                color: "#f5f5f7",
                boxShadow: "0 8px 30px rgba(20,40,80,.07)",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: -60,
                  right: -40,
                  width: 300,
                  height: 300,
                  borderRadius: "50%",
                  background: "radial-gradient(circle, rgba(22,104,194,.5), transparent 68%)",
                  filter: "blur(8px)",
                  animation: "gtGlow 11s ease-in-out infinite",
                }}
              />
              <div style={{ position: "relative" }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    letterSpacing: ".06em",
                    color: "#5aa0ec",
                    marginBottom: 16,
                  }}
                >
                  01
                </div>
                <h3
                  style={{
                    margin: "0 0 16px",
                    fontWeight: 700,
                    fontSize: "clamp(28px,3vw,38px)",
                    letterSpacing: "-.02em",
                  }}
                >
                  客製化網站建置
                </h3>
                <p style={{ margin: 0, fontSize: 17, lineHeight: 1.7, opacity: 0.8, maxWidth: 340 }}>
                  從品牌策略、視覺到前後端工程，量身打造專屬於你的企業形象與電商網站。
                </p>
              </div>
            </div>

            {/* 05 AI CRM（深色大卡，橘光暈） */}
            <div
              data-reveal=""
              style={{
                gridColumn: "span 3",
                minHeight: 380,
                borderRadius: 30,
                padding: 42,
                display: "flex",
                flexDirection: "column",
                background: "#1d1d1f",
                color: "#f5f5f7",
                boxShadow: "0 8px 30px rgba(20,40,80,.07)",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  bottom: -70,
                  left: -50,
                  width: 320,
                  height: 320,
                  borderRadius: "50%",
                  background: "radial-gradient(circle, rgba(239,125,34,.45), transparent 68%)",
                  filter: "blur(8px)",
                  animation: "gtGlow 13s ease-in-out infinite",
                }}
              />
              <div style={{ position: "relative" }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    letterSpacing: ".06em",
                    color: "#f0a564",
                    marginBottom: 16,
                  }}
                >
                  05
                </div>
                <h3
                  style={{
                    margin: "0 0 16px",
                    fontWeight: 700,
                    fontSize: "clamp(28px,3vw,38px)",
                    letterSpacing: "-.02em",
                  }}
                >
                  AI CRM 系統客製化開發
                </h3>
                <p style={{ margin: 0, fontSize: 17, lineHeight: 1.7, opacity: 0.8, maxWidth: 340 }}>
                  依營運流程打造會員與客戶關係管理系統，導入 AI 分析與自動化，讓數據驅動每一次決策。
                </p>
              </div>
            </div>

            {/* 03 金流／物流串接 */}
            <ServiceCardSmall
              span={2}
              num="03"
              title="金流／物流串接"
              desc="串接主流金、物流，下單到出貨一氣呵成。"
            />
            {/* 04 電子發票串接 */}
            <ServiceCardSmall
              span={2}
              num="04"
              title="電子發票串接"
              desc="自動化開立、作廢與管理，合規又省力。"
            />
            {/* 02 部落格系統 */}
            <ServiceCardSmall
              span={2}
              num="02"
              title="部落格系統"
              desc="穩固的內容管理架構，持續累積品牌聲量。"
            />
            {/* 06 網站代管與維護 */}
            <ServiceCardWide
              num="06"
              title="網站代管與維護"
              desc="伺服器管理、資安防護、備份與效能優化，確保網站穩定運行無虞。"
            />
            {/* 07 SEO／數位行銷顧問 */}
            <ServiceCardWide
              num="07"
              title="SEO／數位行銷顧問"
              desc="AI 驅動、流量提升與行銷自動化，成為品牌長期成長的策略夥伴。"
            />
          </div>
        </div>
      </section>

      {/* ============ WORK ============ */}
      <section
        id="work"
        style={{
          position: "relative",
          zIndex: 1,
          padding: "140px 6vw",
          scrollMarginTop: 60,
          background: "#f5f5f7",
        }}
      >
        <div style={{ maxWidth: 1160, margin: "0 auto" }}>
          <div data-reveal="" style={{ textAlign: "center", marginBottom: 60 }}>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                letterSpacing: ".04em",
                color: BRAND_BLUE,
                marginBottom: 20,
              }}
            >
              Featured Projects
            </div>
            <h2
              style={{
                margin: 0,
                fontWeight: 700,
                fontSize: "clamp(36px,5vw,72px)",
                lineHeight: 1.06,
                letterSpacing: "-.025em",
                color: "#1d1d1f",
              }}
            >
              代表案例
            </h2>
          </div>

          <div
            data-stagger-group=""
            className="gt-work-grid"
            style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 26 }}
          >
            {projects.map((p, i) => (
              <ProjectCard key={`${p.name}-${i}`} project={p} />
            ))}
          </div>
        </div>
      </section>

      {/* ============ CONTACT ============ */}
      <section
        id="contact"
        style={{
          position: "relative",
          zIndex: 1,
          padding: "170px 6vw",
          scrollMarginTop: 60,
          textAlign: "center",
        }}
      >
        <div data-reveal="" style={{ maxWidth: 820, margin: "0 auto" }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: ".04em",
              color: BRAND_BLUE,
              marginBottom: 24,
            }}
          >
            Let&apos;s Work Together
          </div>
          <h2
            style={{
              margin: "0 0 26px",
              fontWeight: 700,
              fontSize: "clamp(40px,6vw,90px)",
              lineHeight: 1.04,
              letterSpacing: "-.028em",
              color: "#1d1d1f",
            }}
          >
            已經有想法了嗎？
          </h2>
          <p
            style={{
              margin: "0 auto 44px",
              maxWidth: 480,
              fontSize: 19,
              lineHeight: 1.7,
              color: "#6e6e73",
            }}
          >
            不論是全新官網、系統整合，或既有網站的優化升級——歡迎直接與我們聊聊你的構想。
          </p>
          <a
            href={lineUrl}
            target="_blank"
            rel="noopener"
            onMouseEnter={onPrimaryEnter}
            onMouseLeave={onPrimaryLeave}
            style={{
              display: "inline-block",
              fontSize: 17,
              fontWeight: 500,
              color: "#fff",
              background: BRAND_BLUE,
              padding: "16px 44px",
              borderRadius: 980,
              textDecoration: "none",
            }}
          >
            透過 LINE 聯絡我們
          </a>
        </div>
      </section>

      {/* ============ FOOTER ============ */}
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
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                width: 8,
                height: 8,
                background: "linear-gradient(135deg,#1668c2,#ef7d22)",
                borderRadius: 2,
                transform: "rotate(45deg)",
                display: "inline-block",
              }}
            />
            <span style={{ fontWeight: 600, fontSize: 15, color: "#1d1d1f" }}>Gather</span>
          </div>
          <div style={{ fontSize: 12, color: "#86868b" }}>
            給樂行銷有限公司　·　統編 82962763　·　Copyright © 2026 All rights reserved.
          </div>
          <a
            href={lineUrl}
            target="_blank"
            rel="noopener"
            onMouseEnter={onTextEnter}
            onMouseLeave={onTextLeave}
            style={{ fontSize: 13, color: BRAND_BLUE, textDecoration: "none" }}
          >
            LINE 諮詢 ›
          </a>
        </div>
      </footer>
    </>
  );
}

/* ── 服務卡：中卡（span 2，淺灰）── */
function ServiceCardSmall({
  span,
  num,
  title,
  desc,
}: {
  span: number;
  num: string;
  title: string;
  desc: string;
}) {
  return (
    <div
      data-reveal=""
      style={{
        gridColumn: `span ${span}`,
        minHeight: 260,
        borderRadius: 26,
        padding: 34,
        background: "#f5f5f7",
        boxShadow: "0 8px 30px rgba(20,40,80,.07)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: ".06em",
          color: BRAND_BLUE,
          marginBottom: 12,
        }}
      >
        {num}
      </div>
      <h3
        style={{
          margin: "0 0 10px",
          fontWeight: 700,
          fontSize: 24,
          letterSpacing: "-.018em",
          color: "#1d1d1f",
        }}
      >
        {title}
      </h3>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65, color: "#6e6e73" }}>{desc}</p>
    </div>
  );
}

/* ── 服務卡：寬卡（span 3，淺灰，標題 26px）── */
function ServiceCardWide({ num, title, desc }: { num: string; title: string; desc: string }) {
  return (
    <div
      data-reveal=""
      style={{
        gridColumn: "span 3",
        minHeight: 230,
        borderRadius: 26,
        padding: 38,
        background: "#f5f5f7",
        boxShadow: "0 8px 30px rgba(20,40,80,.07)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: ".06em",
          color: BRAND_BLUE,
          marginBottom: 12,
        }}
      >
        {num}
      </div>
      <h3
        style={{
          margin: "0 0 10px",
          fontWeight: 700,
          fontSize: 26,
          letterSpacing: "-.018em",
          color: "#1d1d1f",
        }}
      >
        {title}
      </h3>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65, color: "#6e6e73" }}>{desc}</p>
    </div>
  );
}

/* ── 作品卡 ── */
function ProjectCard({ project }: { project: Project }) {
  const placeholderStyle: CSSProperties = {
    aspectRatio: "4 / 3",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg,#eef1f5,#f6f7f9)",
    position: "relative",
  };
  return (
    <a
      href={project.url}
      target="_blank"
      rel="noopener"
      data-reveal=""
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-8px)";
        e.currentTarget.style.boxShadow = "0 24px 50px rgba(20,40,80,.16)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "none";
        e.currentTarget.style.boxShadow = "0 8px 30px rgba(20,40,80,.07)";
      }}
      style={{
        display: "block",
        textDecoration: "none",
        background: "#fff",
        borderRadius: 24,
        overflow: "hidden",
        boxShadow: "0 8px 30px rgba(20,40,80,.07)",
        transition: "transform .4s cubic-bezier(.2,.7,.2,1), box-shadow .4s ease",
      }}
    >
      <div style={placeholderStyle}>
        {project.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={project.image_url}
            alt={project.name}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <>
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "repeating-linear-gradient(135deg, rgba(0,0,0,.02) 0 12px, rgba(0,0,0,.04) 12px 24px)",
              }}
            />
            <span
              style={{
                position: "relative",
                fontFamily: "'Space Mono',monospace",
                fontSize: 11,
                letterSpacing: ".16em",
                color: "#9aa3b0",
                textTransform: "uppercase",
              }}
            >
              {project.name}
            </span>
          </>
        )}
      </div>
      <div style={{ padding: "24px 26px 28px" }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: ".12em",
            textTransform: "uppercase",
            color: "#ef7d22",
            marginBottom: 11,
          }}
        >
          {project.cat}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
          }}
        >
          <h3
            style={{
              margin: 0,
              fontWeight: 600,
              fontSize: 20,
              letterSpacing: "-.01em",
              color: "#1d1d1f",
            }}
          >
            {project.name}
          </h3>
          <span style={{ fontSize: 18, color: BRAND_BLUE }}>↗</span>
        </div>
      </div>
    </a>
  );
}
