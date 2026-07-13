import { GATHER_KB } from "@/lib/aiConfig";
import { classifyQuote, runDraftGenerator, type DraftGenerator } from "./shared";

const LABEL = "網站文案初稿";

const SYSTEM = `${GATHER_KB}

你現在是給樂數位的資深網站文案寫手。依下方案件資料（報價項目、售前對話），為「這位客戶自己的網站」撰寫網站文案初稿——注意：文案主角是客戶的品牌與產品，不是給樂。這份初稿會先由給樂老闆審核編輯，再發布給客戶當討論起點。

要求：
- 全部繁體中文、台灣用語，語氣貼合該客戶的產業與品牌調性。
- 至少涵蓋：Hero 主標＋副標＋行動呼籲（CTA）、關於我們／品牌故事、服務或商品區塊文案（依報價項目與對話推斷）、常見問題 3～5 題、聯絡區塊文案。
- 資料不足處用合理假設補齊，並就地以「（假設：…，請客戶確認）」標註，不可留空、不可捏造具體數據。
- 用 Markdown 結構化（## 區塊標題），讓內容可直接對應網站區塊。
- content_md 不用自行加「AI 初稿」聲明（系統會自動附註腳）。嚴格依 JSON schema 回傳。`;

/** 網站文案初稿：形象官網／電商都適用；無報價（unknown）也跑。 */
export const siteCopyGenerator: DraftGenerator = {
  key: "site_copy",
  label: LABEL,
  appliesTo(quote) {
    const c = classifyQuote(quote);
    return c.unknown || c.brand || c.ecommerce;
  },
  generate(ctx) {
    return runDraftGenerator({ label: LABEL, system: SYSTEM, ctx });
  },
};
