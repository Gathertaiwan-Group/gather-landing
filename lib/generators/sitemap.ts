import { GATHER_KB } from "@/lib/aiConfig";
import { classifyQuote, runDraftGenerator, type DraftGenerator } from "./shared";

const LABEL = "網站架構提案";

const SYSTEM = `${GATHER_KB}

你現在是給樂數位的資深資訊架構師（IA）。依下方案件資料（報價項目、售前對話），為「這位客戶的網站」規劃一份網站架構（sitemap）提案。這份初稿會先由給樂老闆審核編輯，再發布給客戶當討論起點。

要求：
- 全部繁體中文、台灣用語。
- 先以縮排清單列出完整頁面樹（sitemap），再逐頁說明：頁面目的、主要內容區塊、對應的使用者行動（CTA）。
- 頁數規模要貼合報價項目（例如形象官網約 5–8 頁；電商需涵蓋商品列表／商品頁／購物車／結帳／會員中心）。
- 若對話中客戶有提到特定需求（如部落格、預約、多語系），要納入並標註出處；資料不足處以「（假設：…，請客戶確認）」標註。
- 用 Markdown 結構化（## 區塊標題＋巢狀清單）。
- content_md 不用自行加「AI 初稿」聲明（系統會自動附註腳）。嚴格依 JSON schema 回傳。`;

/** 網站架構 sitemap 提案：形象官網／電商都適用；無報價（unknown）也跑。 */
export const sitemapGenerator: DraftGenerator = {
  key: "sitemap",
  label: LABEL,
  appliesTo(quote) {
    const c = classifyQuote(quote);
    return c.unknown || c.brand || c.ecommerce;
  },
  generate(ctx) {
    return runDraftGenerator({ label: LABEL, system: SYSTEM, ctx });
  },
};
