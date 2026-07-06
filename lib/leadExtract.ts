import { callGeminiJSON, type ChatTurn } from "@/lib/gemini";

export type Lead = {
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  contact_line: string | null;
  summary: string | null;
  intent: string | null;
};

// Gemini responseSchema（結構化輸出）。全部選填、無則空字串。
const LEAD_SCHEMA: Record<string, unknown> = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING", description: "訪客的稱呼/姓名，沒有就空字串" },
    phone: { type: "STRING", description: "訪客留的電話/手機，沒有就空字串" },
    email: { type: "STRING", description: "訪客留的 Email，沒有就空字串" },
    line: { type: "STRING", description: "訪客留的 LINE ID，沒有就空字串" },
    summary: { type: "STRING", description: "一句繁體中文摘要，說明訪客想做什麼/需求" },
    intent: { type: "STRING", description: "簡短意向：詢價、合作意向、一般諮詢、技術問題 等" },
  },
};

const EXTRACT_SYSTEM = `你是給樂數位官網客服對話的資訊萃取器。從對話中萃取「訪客本人明確提供」的聯絡資訊與需求。
規則：
- 只抓訪客（使用者）真的講過的資訊；AI 助理說的、或訪客沒提供的，一律留空字串，絕不杜撰或臆測。
- name=稱呼/姓名；phone=電話（只保留數字）；email；line=LINE ID。
- summary=用一句繁體中文描述訪客的需求/想做的事（沒有明確需求就空字串）。
- intent=簡短意向詞（詢價／合作意向／一般諮詢／技術問題…）。
- 嚴格依 JSON schema 回傳，不要多加說明。`;

function clean(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, 200) : null;
}

function digitsOnly(v: string | null): string | null {
  if (!v) return null;
  const d = v.replace(/[^\d]/g, "");
  return d.length >= 6 ? d : v; // 保底：抓不到數字就原樣保留
}

/**
 * 從整段對話萃取聯絡資訊 + 需求摘要。無 key／萃取失敗／全空 → 回 null。
 * 由 logChat 在偵測到聯絡訊號時呼叫。
 */
export async function extractLead(turns: ChatTurn[]): Promise<Lead | null> {
  const transcript = turns
    .map((t) => `${t.role === "user" ? "訪客" : "AI"}：${t.text}`)
    .join("\n")
    .slice(0, 4000);

  const raw = await callGeminiJSON<{
    name?: string;
    phone?: string;
    email?: string;
    line?: string;
    summary?: string;
    intent?: string;
  }>(`對話內容：\n${transcript}`, { system: EXTRACT_SYSTEM, schema: LEAD_SCHEMA, maxTokens: 400 });

  if (!raw) return null;

  const lead: Lead = {
    contact_name: clean(raw.name),
    contact_phone: digitsOnly(clean(raw.phone)),
    contact_email: clean(raw.email),
    contact_line: clean(raw.line),
    summary: clean(raw.summary),
    intent: clean(raw.intent),
  };

  // 全空 → 視為沒抓到
  if (
    !lead.contact_name &&
    !lead.contact_phone &&
    !lead.contact_email &&
    !lead.contact_line &&
    !lead.summary
  ) {
    return null;
  }
  return lead;
}

/**
 * 最新一則使用者訊息是否含「聯絡訊號」（電話/Email/LINE 線索）。
 * 作為是否呼叫（較貴的）萃取的成本閘——一般問答回合不會觸發第二次 Gemini。
 */
export function hasContactSignal(text: string): boolean {
  if (!text) return false;
  // Email
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(text)) return true;
  // 電話：訊息內數字總長 ≥ 8
  if (text.replace(/[^\d]/g, "").length >= 8) return true;
  // LINE / handle 線索（\bline\b 避免誤中 online/deadline）
  if (/\bline\b|賴|@[a-z0-9._-]{2,}/i.test(text)) return true;
  return false;
}
