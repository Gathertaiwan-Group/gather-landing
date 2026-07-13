import { GATHER_KB } from "@/lib/aiConfig";
import { classifyQuote, runDraftGenerator, type DraftGenerator, type GeneratorContext } from "./shared";

const LABEL = "設計方向提案";

const BASE_RULES = `要求：
- 全部繁體中文、台灣用語。
- 資料不足處用合理假設補齊，並就地以「（假設：…，請客戶確認）」標註，不可捏造。
- 用 Markdown 結構化（## 區塊標題）。
- content_md 不用自行加「AI 初稿」聲明（系統會自動附註腳）。嚴格依 JSON schema 回傳。`;

/** 網站案：視覺設計方向。 */
const VISUAL_SYSTEM = `${GATHER_KB}

你現在是給樂數位的資深視覺設計總監。依下方案件資料（報價項目、售前對話），為「這位客戶的網站」提出設計方向提案。這份初稿會先由給樂老闆審核編輯，再發布給客戶當討論起點。

內容需涵蓋：品牌調性關鍵字（3–5 個）、色彩方向（主色／輔色，附 HEX 供討論）、字體方向（中文＋西文搭配建議）、版面與影像風格（留白、圓角、攝影或插畫調性）、2–3 個可對照的風格參考方向（描述即可，不用附連結）、以及「需要客戶提供的素材清單」。

${BASE_RULES}`;

/** 系統案（CRM／後台等）：系統規劃方向。 */
const SYSTEM_PLANNING_SYSTEM = `${GATHER_KB}

你現在是給樂數位的資深系統分析師（SA）。依下方案件資料（報價項目、售前對話），為「這位客戶的系統」提出系統規劃方向提案。這份初稿會先由給樂老闆審核編輯，再發布給客戶當討論起點。

內容需涵蓋：系統目標與範圍摘要、使用者角色（roles）與權限輪廓、核心功能模組拆解（逐模組一句話說明）、關鍵流程（例如客戶資料進件→分群→自動化行銷）、後台介面設計原則、以及「需要客戶確認的開放問題清單」。

${BASE_RULES}`;

/**
 * 設計方向提案：形象官網→視覺設計方向；CRM／系統案→系統規劃方向（同一 generator、prompt 分流）；
 * 純電商不跑（版型多依商城框架）；無報價（unknown）也跑。
 */
export const designBriefGenerator: DraftGenerator = {
  key: "design_brief",
  label: LABEL,
  appliesTo(quote) {
    const c = classifyQuote(quote);
    return c.unknown || c.brand || c.system;
  },
  generate(ctx: GeneratorContext) {
    const c = classifyQuote(ctx.quote);
    const system = c.system && !c.brand ? SYSTEM_PLANNING_SYSTEM : VISUAL_SYSTEM;
    return runDraftGenerator({ label: LABEL, system, ctx });
  },
};
