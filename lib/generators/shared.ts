import { callGeminiJSON } from "@/lib/gemini";
import type { ClientCase } from "@/lib/adminCases";
import type { Quote } from "@/lib/quote";

// P2 AI 初稿 generators 共用型別與工具。
// 每個 generator 產一份 Markdown 草稿（deliverables status='draft'，僅老闆可見），
// 老闆在後台審核編輯後才發布到客戶 portal。

export type GeneratorKey = "site_copy" | "sitemap" | "design_brief";

export type GeneratorContext = {
  caseRow: ClientCase;
  quote: Quote | null;
  chatTranscript: string;
};

export type DraftResult = { title: string; content_md: string } | null;

export type DraftGenerator = {
  key: GeneratorKey;
  label: string;
  /** 依報價項目判斷此 generator 適不適用（無報價一律適用）。 */
  appliesTo(quote: Quote | null): boolean;
  /** 產出草稿；AI 失敗回 null（不 throw）。 */
  generate(ctx: GeneratorContext): Promise<DraftResult>;
};

/**
 * 交付物標題（固定格式）——generate-drafts 冪等的依據：
 * 同 case 已存在「完全相同 title」的交付物 → 該 generator skip，不重打 AI、不重建。
 */
export function aiDraftTitle(label: string): string {
  return `【AI 初稿】${label}`;
}

/** 每份初稿固定附註腳（人審中心：AI 產出僅是討論起點）。 */
export const AI_DRAFT_FOOTER =
  "\n\n---\n\n> 此為 AI 初稿，僅供討論起點；實際內容以雙方確認後為準。";

/** 報價項目全文（分類關鍵字用）。 */
function quoteItemsText(quote: Quote | null): string {
  if (!quote || !Array.isArray(quote.line_items)) return "";
  return quote.line_items.map((it) => it.description).join("｜");
}

export type QuoteKind = { brand: boolean; ecommerce: boolean; system: boolean; unknown: boolean };

/**
 * 專案類型分類（依報價項目關鍵字）：
 * 官網/形象/品牌 → brand；電商/商城/購物 → ecommerce；CRM/ERP/系統/後台/App → system。
 * 無報價、或關鍵字全落空 → unknown（三個 generator 都跑，寧多勿漏，反正是草稿）。
 */
export function classifyQuote(quote: Quote | null): QuoteKind {
  const text = quoteItemsText(quote);
  if (!text.trim()) return { brand: false, ecommerce: false, system: false, unknown: true };
  const brand = /官網|形象|品牌/.test(text);
  const ecommerce = /電商|商城|購物|網店/.test(text);
  const system = /crm|erp|系統|後台|app/i.test(text);
  const unknown = !brand && !ecommerce && !system;
  return { brand, ecommerce, system, unknown };
}

/** 組給 Gemini 的案件簡報（案件＋報價項目＋售前對話）。 */
export function caseBrief(ctx: GeneratorContext): string {
  const { caseRow, quote, chatTranscript } = ctx;
  const items =
    quote && Array.isArray(quote.line_items) && quote.line_items.length > 0
      ? quote.line_items
          .map((it) => `- ${it.description} × ${it.qty}（單價 NT$${Number(it.unit_price).toLocaleString("en-US")}）`)
          .join("\n")
      : "（尚無報價單）";
  return [
    `【案件名稱】${caseRow.title}`,
    `【客戶】${caseRow.client_name}`,
    caseRow.notes?.trim() ? `【案件備註】${caseRow.notes.trim().slice(0, 800)}` : "",
    `【報價項目】\n${items}`,
    quote?.notes?.trim() ? `【報價備註】${quote.notes.trim().slice(0, 500)}` : "",
    chatTranscript.trim()
      ? `【售前對話紀錄】\n${chatTranscript.trim().slice(0, 6000)}`
      : "【售前對話紀錄】（無，僅依上方資料推斷）",
  ]
    .filter(Boolean)
    .join("\n\n");
}

const DRAFT_SCHEMA: Record<string, unknown> = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING", description: "此份初稿的主標題（繁體中文，一句話）" },
    content_md: { type: "STRING", description: "完整 Markdown 內容（繁體中文）" },
  },
};

/** 共用執行器：caseBrief 當 user prompt → callGeminiJSON → 固定 title＋自動附註腳。失敗回 null。 */
export async function runDraftGenerator(opts: {
  label: string;
  system: string;
  ctx: GeneratorContext;
  maxTokens?: number;
}): Promise<DraftResult> {
  const raw = await callGeminiJSON<{ title?: string; content_md?: string }>(caseBrief(opts.ctx), {
    system: opts.system,
    schema: DRAFT_SCHEMA,
    maxTokens: opts.maxTokens ?? 4096,
  });
  if (!raw) return null;
  const inner = String(raw.content_md ?? "").trim();
  if (!inner) return null;
  const aiTitle = String(raw.title ?? "").trim().slice(0, 150);
  // AI 自己的標題放進內文首行（交付物 title 固定格式，供冪等比對）。
  const heading = aiTitle && !inner.startsWith("#") ? `# ${aiTitle}\n\n` : "";
  return {
    title: aiDraftTitle(opts.label),
    content_md: `${heading}${inner}${AI_DRAFT_FOOTER}`,
  };
}
