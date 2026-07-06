import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import AiToolCard, { type ToolConfig } from "@/components/ai/AiToolCard";
import OpenChatButton from "@/components/ai/OpenChatButton";

export const metadata: Metadata = {
  title: "AI 賦能實驗室 — 給樂數位 Gather",
  description:
    "親自試用給樂數位的 AI 能力：AI 客服、行銷文案生成、客戶分群與流失預測、流程自動化、數據洞察、個人化推薦——由 Gemini 即時驅動。",
  alternates: { canonical: "/ai" },
  openGraph: {
    title: "AI 賦能實驗室 — 給樂數位 Gather",
    description: "親自試用給樂的 6 項 AI 能力，全部即時運作。",
    type: "website",
    url: "https://gathertaiwan.com/ai",
    images: [{ url: "/og.jpg", width: 1200, height: 630 }],
  },
};

const BRAND_BLUE = "#1668c2";

const TOOLS: ToolConfig[] = [
  {
    tool: "copy",
    num: "02",
    title: "AI 行銷文案生成",
    subtitle: "輸入你的產業或產品，AI 立刻生成 FB 貼文、廣告標語與 EDM 主旨。",
    inputKind: "text",
    placeholder: "例如：手沖咖啡電商、寵物美容工作室…",
    cta: "生成文案",
  },
  {
    tool: "segment",
    num: "03",
    title: "客戶分群與流失預測",
    subtitle: "AI 分析客戶行為，自動分群並標記流失風險與挽回建議。",
    inputKind: "none",
    runNote: "▶ 用一份範例客戶資料，示範 AI CRM 如何分群與預測流失。",
    cta: "分析範例客戶",
  },
  {
    tool: "automation",
    num: "04",
    title: "流程自動化藍圖",
    subtitle: "描述一段重複性的人工作業，AI 幫你拆成可落地的自動化流程。",
    inputKind: "textarea",
    placeholder: "例如：每天手動回覆 FB 詢問報價、把訂單資料抄到 Excel…",
    cta: "產生自動化藍圖",
  },
  {
    tool: "insight",
    num: "05",
    title: "數據洞察",
    subtitle: "把散落的數據變成老闆看得懂、能行動的建議。",
    inputKind: "none",
    runNote: "▶ 用本站「真實」的聚合數據，示範 AI 如何把數字變成洞察。",
    cta: "分析本站數據",
  },
  {
    tool: "recommend",
    num: "06",
    title: "個人化推薦",
    subtitle: "說出你的需求，AI 從 30 篇文章中挑出最適合你的內容。",
    inputKind: "text",
    placeholder: "例如：我想讓 Google 找到我的店、想導入 AI 客服…",
    cta: "推薦文章",
  },
];

export default function AiLabPage() {
  return (
    <>
      <SiteHeader />
      <main style={{ position: "relative", zIndex: 1 }}>
        <section style={{ padding: "clamp(120px,18vw,160px) 6vw clamp(30px,6vw,48px)", textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: ".04em", color: BRAND_BLUE, marginBottom: 18 }}>
            AI Playground
          </div>
          <h1
            style={{
              margin: 0,
              fontWeight: 700,
              fontSize: "clamp(34px,5.5vw,68px)",
              lineHeight: 1.08,
              letterSpacing: "-.025em",
              color: "#1d1d1f",
            }}
          >
            AI 賦能實驗室
          </h1>
          <p style={{ margin: "20px auto 0", maxWidth: 600, fontSize: 18, lineHeight: 1.7, color: "#6e6e73" }}>
            別人說「我們會 AI」，我們讓你<strong style={{ color: "#1d1d1f" }}>自己試試看</strong>。
            以下每一項都是即時運作的真實 AI——這，就是給樂為客戶內建的能力。
          </p>
        </section>

        <section style={{ padding: "0 6vw clamp(96px,16vw,150px)" }}>
          <div style={{ maxWidth: 1160, margin: "0 auto" }}>
            <div className="gt-ai-lab-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 24 }}>
              {/* 01 智慧客服（連到全站 widget）*/}
              <div
                style={{
                  background: "#1d1d1f",
                  color: "#f5f5f7",
                  borderRadius: 24,
                  padding: "clamp(24px,4vw,34px)",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: ".06em", color: "#5aa0ec", marginBottom: 12 }}>
                  01
                </div>
                <h3 style={{ margin: "0 0 8px", fontWeight: 700, fontSize: 22, letterSpacing: "-.015em" }}>
                  智慧 AI 客服
                </h3>
                <p style={{ margin: "0 0 18px", fontSize: 15, lineHeight: 1.65, color: "rgba(245,245,247,.72)" }}>
                  懂給樂所有服務的 AI 助理，24 小時回答問題、引導諮詢。點下方，或右下角的
                  <span style={{ color: "#fff" }}> 💬 </span>隨時開聊。
                </p>
                <OpenChatButton />
              </div>

              {TOOLS.map((t) => (
                <AiToolCard key={t.tool} {...t} />
              ))}
            </div>

            <p style={{ textAlign: "center", marginTop: "clamp(34px,6vw,50px)", fontSize: 15, color: "#86868b" }}>
              喜歡這些能力嗎？這些都能為你的系統量身打造、內建其中。
              <a href="/#contact" style={{ color: BRAND_BLUE, marginLeft: 6, textDecoration: "none", fontWeight: 500 }}>
                聊聊你的需求 ›
              </a>
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
