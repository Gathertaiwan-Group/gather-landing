import { createAdminSupabase } from "@/lib/supabase";
import { callGeminiJSON, type ChatTurn } from "@/lib/gemini";
import { GATHER_KB } from "@/lib/aiConfig";
import { RATE_CARD_TEXT, CURRENCY, DEFAULT_VALID_DAYS } from "@/lib/pricing";

export type LineItem = { description: string; qty: number; unit_price: number; amount: number };

export const QUOTE_STATUSES = [
  "draft",
  "sent",
  "viewed",
  "accepted",
  "declined",
  "expired",
  "closed",
] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  sent: "已寄出",
  viewed: "已讀",
  accepted: "已接受",
  declined: "已婉拒",
  expired: "已過期",
  closed: "已關閉",
};
export const QUOTE_STATUS_COLORS: Record<string, { fg: string; bg: string }> = {
  draft: { fg: "#8a6d00", bg: "#fff4d1" },
  sent: { fg: "#0f56a6", bg: "#e2effb" },
  viewed: { fg: "#5a3e9e", bg: "#efe7fb" },
  accepted: { fg: "#1f7a44", bg: "#dcf3e5" },
  declined: { fg: "#b3261e", bg: "#fdecea" },
  expired: { fg: "#6e6e73", bg: "#ececee" },
  closed: { fg: "#6e6e73", bg: "#ececee" },
};

export type Quote = {
  id: string;
  quote_no: string | null;
  session_id: string | null;
  client_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_line: string | null;
  status: string;
  currency: string | null;
  line_items: LineItem[];
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  notes: string | null;
  valid_days: number | null;
  valid_until: string | null;
  public_token: string | null;
  created_by: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  accepted_at: string | null;
  reminded_at: string | null;
  created_at: string;
  updated_at: string;
};

const SELECT =
  "id, quote_no, session_id, client_name, contact_email, contact_phone, contact_line, status, currency, line_items, subtotal, tax, total, notes, valid_days, valid_until, public_token, created_by, sent_at, viewed_at, accepted_at, reminded_at, created_at, updated_at";

// ── 金額 / line items ──
export function normalizeLineItems(raw: unknown): LineItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      const qty = Number(o.qty) || 0;
      const unit_price = Number(o.unit_price) || 0;
      return {
        description: String(o.description ?? "").slice(0, 200),
        qty,
        unit_price,
        amount: Math.round(qty * unit_price),
      };
    })
    .filter((it) => it.description);
}

export function computeTotals(items: LineItem[], taxRate = 0): { subtotal: number; tax: number; total: number } {
  const subtotal = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unit_price) || 0), 0);
  const tax = Math.round(subtotal * taxRate);
  return { subtotal: Math.round(subtotal), tax, total: Math.round(subtotal) + tax };
}

/** 長隨機公開 token（/quote/<token>）。 */
export function randomToken(): string {
  const u = () => globalThis.crypto.randomUUID().replace(/-/g, "");
  return (u() + u()).slice(0, 48);
}

export function moneyTWD(n: number | null | undefined): string {
  const v = Number(n) || 0;
  return `NT$${v.toLocaleString("en-US")}`;
}

// ── Gemini：報價草稿生成 ──
const QUOTE_SCHEMA: Record<string, unknown> = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING", description: "一句話描述此報價" },
    line_items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          description: { type: "STRING" },
          qty: { type: "NUMBER" },
          unit_price: { type: "NUMBER" },
        },
      },
    },
    notes: { type: "STRING", description: "範圍假設 / 需再確認事項" },
  },
};

const QUOTE_SYSTEM = `${GATHER_KB}

你是給樂數位的報價單生成器。只能使用下方【價目表】的服務項目與單價，依對話需求挑出適用項目與合理數量，組出 line_items（unit_price 一律用價目表的數字，不得更改或發明價格）。若需求超出價目表，用最接近項目，並在 notes 註明「此項需再評估」。金額用新台幣整數。title 用一句話描述此報價；notes 可含範圍假設或需再確認事項。嚴格依 JSON schema 回傳。

【價目表】
${RATE_CARD_TEXT}`;

/** 依對話產生報價草稿（金額鎖在價目表內）。失敗 / 無有效項目回 null。 */
export async function generateQuoteDraft(
  turns: ChatTurn[]
): Promise<{ title: string; line_items: LineItem[]; notes: string } | null> {
  const transcript = turns
    .map((t) => `${t.role === "user" ? "訪客" : "AI"}：${t.text}`)
    .join("\n")
    .slice(0, 4000);
  const raw = await callGeminiJSON<{ title?: string; line_items?: unknown; notes?: string }>(
    `【對話內容】\n${transcript}`,
    { system: QUOTE_SYSTEM, schema: QUOTE_SCHEMA, maxTokens: 1200 }
  );
  if (!raw) return null;
  const line_items = normalizeLineItems(raw.line_items).filter((it) => it.unit_price > 0);
  if (line_items.length === 0) return null;
  return {
    title: String(raw.title ?? "初步報價").slice(0, 120),
    line_items,
    notes: String(raw.notes ?? "").slice(0, 1000),
  };
}

// ── Gemini：判斷客人是否已同意收報價 ──
const READY_SCHEMA: Record<string, unknown> = {
  type: "OBJECT",
  properties: { ready: { type: "BOOLEAN" }, email: { type: "STRING" } },
};
const READY_SYSTEM = `判斷這段給樂數位客服對話中，訪客是否「已同意讓給樂幫他整理一份報價」，並抓出他留的 Email。
- ready=true 僅當：訪客明確表達要/同意收報價（例如回覆 好、要、可以、麻煩你、幫我報），且對話已有基本需求輪廓。
- email：抓訪客本人留的 Email，沒有就空字串。
- 只依訪客真的說過的判斷，不臆測。嚴格依 JSON schema 回傳。`;

/** 關鍵字閘：對話出現報價意圖才值得跑（較貴的）分類。 */
export function hasQuoteKeyword(text: string): boolean {
  return /報價|估價|報個價|報一下|價格|多少錢|費用|預算|quote/i.test(text);
}

export async function classifyQuoteReady(turns: ChatTurn[]): Promise<{ ready: boolean; email: string } | null> {
  const transcript = turns
    .map((t) => `${t.role === "user" ? "訪客" : "AI"}：${t.text}`)
    .join("\n")
    .slice(0, 4000);
  const raw = await callGeminiJSON<{ ready?: boolean; email?: string }>(transcript, {
    system: READY_SYSTEM,
    schema: READY_SCHEMA,
    maxTokens: 60,
  });
  if (!raw) return null;
  return { ready: !!raw.ready, email: typeof raw.email === "string" ? raw.email.trim() : "" };
}

// ── DB helpers（service_role）──
export async function insertQuote(data: {
  session_id?: string | null;
  client_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  contact_line?: string | null;
  line_items: LineItem[];
  notes?: string | null;
  created_by?: string;
}): Promise<string | null> {
  const supabase = createAdminSupabase();
  if (!supabase) return null;
  const items = normalizeLineItems(data.line_items);
  const { subtotal, tax, total } = computeTotals(items, 0);
  try {
    const { data: row, error } = await supabase
      .from("quotes")
      .insert({
        session_id: data.session_id ?? null,
        client_name: data.client_name ?? null,
        contact_email: data.contact_email ?? null,
        contact_phone: data.contact_phone ?? null,
        contact_line: data.contact_line ?? null,
        status: "draft",
        currency: CURRENCY,
        line_items: items,
        subtotal,
        tax,
        total,
        notes: data.notes ?? null,
        valid_days: DEFAULT_VALID_DAYS,
        created_by: data.created_by ?? "ai",
      })
      .select("id")
      .single();
    if (error || !row) return null;
    return row.id as string;
  } catch {
    return null;
  }
}

/** 全部報價（後台）；草稿置頂，其餘依更新新到舊。出錯回 []。 */
export async function getQuotes(): Promise<Quote[]> {
  const supabase = createAdminSupabase();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.from("quotes").select(SELECT).order("updated_at", { ascending: false });
    if (error || !data) return [];
    const rows = data as Quote[];
    return rows.sort((a, b) => (a.status === "draft" ? -1 : 0) - (b.status === "draft" ? -1 : 0));
  } catch {
    return [];
  }
}

export async function getQuote(id: string): Promise<Quote | null> {
  const supabase = createAdminSupabase();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.from("quotes").select(SELECT).eq("id", id).maybeSingle();
    if (error || !data) return null;
    return data as Quote;
  } catch {
    return null;
  }
}

export async function getQuoteByToken(token: string): Promise<Quote | null> {
  const supabase = createAdminSupabase();
  if (!supabase || !token) return null;
  try {
    const { data, error } = await supabase.from("quotes").select(SELECT).eq("public_token", token).maybeSingle();
    if (error || !data) return null;
    return data as Quote;
  } catch {
    return null;
  }
}

/** 同一段對話已有報價？（去重用）回 id 或 null。 */
export async function getQuoteIdBySession(sessionId: string): Promise<string | null> {
  const supabase = createAdminSupabase();
  if (!supabase || !sessionId) return null;
  try {
    const { data } = await supabase.from("quotes").select("id").eq("session_id", sessionId).limit(1).maybeSingle();
    return (data?.id as string) ?? null;
  } catch {
    return null;
  }
}

export async function getDraftQuoteCount(): Promise<number> {
  const supabase = createAdminSupabase();
  if (!supabase) return 0;
  try {
    const { count, error } = await supabase
      .from("quotes")
      .select("*", { count: "exact", head: true })
      .eq("status", "draft");
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

export function isExpired(q: Quote): boolean {
  return !!q.valid_until && new Date(q.valid_until).getTime() < Date.now();
}

/** 更新報價欄位；帶 line_items / tax_rate 時重算 subtotal/tax/total。回更新後 Quote。 */
export async function updateQuote(
  id: string,
  patch: {
    client_name?: string | null;
    contact_email?: string | null;
    contact_phone?: string | null;
    contact_line?: string | null;
    line_items?: LineItem[];
    notes?: string | null;
    valid_days?: number | null;
    tax_rate?: number; // 0 或 0.05
    status?: string;
  }
): Promise<Quote | null> {
  const supabase = createAdminSupabase();
  if (!supabase) return null;
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.client_name !== undefined) upd.client_name = patch.client_name || null;
  if (patch.contact_email !== undefined) upd.contact_email = patch.contact_email || null;
  if (patch.contact_phone !== undefined) upd.contact_phone = patch.contact_phone || null;
  if (patch.contact_line !== undefined) upd.contact_line = patch.contact_line || null;
  if (patch.notes !== undefined) upd.notes = patch.notes || null;
  if (patch.valid_days != null) upd.valid_days = Number(patch.valid_days) || DEFAULT_VALID_DAYS;
  if (patch.status !== undefined && (QUOTE_STATUSES as readonly string[]).includes(patch.status)) upd.status = patch.status;
  if (patch.line_items !== undefined) {
    const items = normalizeLineItems(patch.line_items);
    const { subtotal, tax, total } = computeTotals(items, patch.tax_rate ?? 0);
    upd.line_items = items;
    upd.subtotal = subtotal;
    upd.tax = tax;
    upd.total = total;
  } else if (patch.tax_rate !== undefined) {
    const cur = await getQuote(id);
    if (cur) {
      const { subtotal, tax, total } = computeTotals(cur.line_items, patch.tax_rate);
      upd.subtotal = subtotal;
      upd.tax = tax;
      upd.total = total;
    }
  }
  try {
    const { data, error } = await supabase.from("quotes").update(upd).eq("id", id).select(SELECT).maybeSingle();
    if (error || !data) return null;
    return data as Quote;
  } catch {
    return null;
  }
}

/** 核准並準備寄出：產 public_token、設 valid_until、status→sent。回更新後 Quote 或 null。 */
export async function prepareQuoteForSend(id: string): Promise<Quote | null> {
  const supabase = createAdminSupabase();
  if (!supabase) return null;
  const cur = await getQuote(id);
  if (!cur) return null;
  const token = cur.public_token || randomToken();
  const days = cur.valid_days ?? DEFAULT_VALID_DAYS;
  const validUntil = new Date(Date.now() + days * 86400000).toISOString();
  try {
    const { data, error } = await supabase
      .from("quotes")
      .update({
        public_token: token,
        valid_until: validUntil,
        status: "sent",
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(SELECT)
      .maybeSingle();
    if (error || !data) return null;
    return data as Quote;
  } catch {
    return null;
  }
}

/** 公開頁首次瀏覽：status sent→viewed、記 viewed_at。 */
export async function markQuoteViewed(id: string): Promise<void> {
  const supabase = createAdminSupabase();
  if (!supabase) return;
  try {
    await supabase
      .from("quotes")
      .update({ viewed_at: new Date().toISOString(), status: "viewed", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "sent");
  } catch {
    /* ignore */
  }
}

/** 依 token 接受報價（未接受且未過期）。已接受回原 Quote；過期/找不到回 null。 */
export async function acceptQuoteByToken(token: string): Promise<Quote | null> {
  const supabase = createAdminSupabase();
  if (!supabase || !token) return null;
  const cur = await getQuoteByToken(token);
  if (!cur) return null;
  if (cur.accepted_at) return cur;
  if (isExpired(cur)) return null;
  try {
    const { data, error } = await supabase
      .from("quotes")
      .update({ accepted_at: new Date().toISOString(), status: "accepted", updated_at: new Date().toISOString() })
      .eq("id", cur.id)
      .select(SELECT)
      .maybeSingle();
    if (error || !data) return null;
    return data as Quote;
  } catch {
    return null;
  }
}

export async function deleteQuote(id: string): Promise<boolean> {
  const supabase = createAdminSupabase();
  if (!supabase) return false;
  try {
    const { error } = await supabase.from("quotes").delete().eq("id", id);
    return !error;
  } catch {
    return false;
  }
}
