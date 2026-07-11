import { createAdminSupabase } from "@/lib/supabase";
import { randomToken, moneyTWD, type Quote, type LineItem } from "@/lib/quote";
import {
  getSetting,
  DEFAULT_COMPANY_PROFILE,
  DEFAULT_CONTRACT_TEMPLATE,
  DEFAULT_DEPOSIT_RATIO,
  type CompanyProfile,
} from "@/lib/settings";

// 合約（contracts 表）：報價被接受後自動產生 → 客人於 /contract/<token> 線上簽署。

export type ContractStatus = "draft" | "sent" | "signed" | "voided";

export type Contract = {
  id: string;
  contract_no: string | null;
  case_id: string | null;
  quote_id: string | null;
  client_name: string | null;
  contact_email: string | null;
  content_md: string;
  status: ContractStatus;
  public_token: string | null;
  sent_at: string | null;
  signed_at: string | null;
  signer_name: string | null;
  signer_ip: string | null;
  signer_user_agent: string | null;
  reminded_at: string | null;
  created_at: string;
  updated_at: string;
};

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  draft: "草稿",
  sent: "待簽署",
  signed: "已簽署",
  voided: "已作廢",
};

/**
 * 狀態 chip className（value 為 class 字串；顏色語意比照 QUOTE_STATUS_COLORS：
 * draft 黃、sent 藍、signed 綠、voided 灰）。樣式類別由使用端於 globals.css 定義。
 */
export const CONTRACT_STATUS_COLORS: Record<ContractStatus, string> = {
  draft: "gt-status-chip gt-status-chip--draft",
  sent: "gt-status-chip gt-status-chip--sent",
  signed: "gt-status-chip gt-status-chip--signed",
  voided: "gt-status-chip gt-status-chip--voided",
};

const SELECT =
  "id, contract_no, case_id, quote_id, client_name, contact_email, content_md, status, public_token, sent_at, signed_at, signer_name, signer_ip, signer_user_agent, reminded_at, created_at, updated_at";

/** 依總價與比例拆訂金／尾款（訂金四捨五入、尾款補差，兩者相加必等於 total）。 */
export function depositAmounts(total: number, ratio: number): { deposit: number; final: number } {
  const t = Number(total) || 0;
  const deposit = Math.round(t * ratio);
  return { deposit, final: t - deposit };
}

/** 訂金比例合法性（0 < r < 1），不合法回預設。 */
function normalizeDepositRatio(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n < 1 ? n : DEFAULT_DEPOSIT_RATIO;
}

/** 今日日期（台北時區）→ YYYY.MM.DD，格式照 /quote 公開頁。 */
function fmtDateTaipei(d: Date): string {
  const t = new Date(d.getTime() + 8 * 3600000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}.${p(t.getUTCMonth() + 1)}.${p(t.getUTCDate())}`;
}

/** markdown 表格 cell 防呆：| 換全形、去換行。 */
function mdCell(s: string): string {
  return String(s).replace(/\|/g, "／").replace(/\s*\n\s*/g, " ");
}

/** 報價項目 → markdown 表格。 */
function lineItemsMdTable(items: LineItem[]): string {
  if (!Array.isArray(items) || items.length === 0) return "（服務項目以雙方確認之需求為準）";
  const rows = items.map(
    (it) => `| ${mdCell(it.description)} | ${Number(it.qty) || 0} | ${moneyTWD(it.unit_price)} | ${moneyTWD(it.amount)} |`
  );
  return ["| 項目 | 數量 | 單價 | 小計 |", "| --- | ---: | ---: | ---: |", ...rows].join("\n");
}

/** 報價「標題」：首項描述（多項時加「等 N 項」）。quotes 表沒有 title 欄，以此代替。 */
function quoteTitleOf(quote: Quote): string {
  const items = Array.isArray(quote.line_items) ? quote.line_items : [];
  const first = items[0]?.description?.trim();
  if (!first) return "軟體開發服務";
  return items.length > 1 ? `${first} 等 ${items.length} 項` : first;
}

/**
 * 模板 → 合約全文（Markdown）。替換 placeholders：
 * {{date}} {{client_name}} {{company_name}} {{quote_no}} {{quote_title}} {{line_items}}
 * {{subtotal}} {{tax}} {{total}} {{deposit_amount}} {{final_amount}} {{deposit_ratio_percent}}。
 * 例外：{{contract_no}} 於 insert 後才有編號（DB sequence 產號），由 createContractFromQuote 回填。
 */
export function renderContractMd(template: string, quote: Quote, company: CompanyProfile, depositRatio: number): string {
  const ratio = normalizeDepositRatio(depositRatio);
  const total = Number(quote.total) || 0;
  const { deposit, final } = depositAmounts(total, ratio);
  const map: Record<string, string> = {
    date: fmtDateTaipei(new Date()),
    client_name: quote.client_name?.trim() || "客戶",
    company_name: company?.name?.trim() || DEFAULT_COMPANY_PROFILE.name,
    quote_no: quote.quote_no ?? "—",
    quote_title: quoteTitleOf(quote),
    line_items: lineItemsMdTable(quote.line_items),
    subtotal: moneyTWD(quote.subtotal),
    tax: moneyTWD(quote.tax),
    total: moneyTWD(quote.total),
    deposit_amount: moneyTWD(deposit),
    final_amount: moneyTWD(final),
    deposit_ratio_percent: String(Math.round(ratio * 100)),
  };
  return String(template).replace(/\{\{(\w+)\}\}/g, (m, key: string) => (key in map ? map[key] : m));
}

/**
 * 報價 → 合約（status='sent'，即待簽署）。
 * 冪等：同一張報價已有合約 → 回既有（getContractByQuoteId 去重），不重複建立。
 */
export async function createContractFromQuote(quote: Quote): Promise<Contract | null> {
  const supabase = createAdminSupabase();
  if (!supabase || !quote?.id) return null;

  const existing = await getContractByQuoteId(quote.id);
  if (existing) return existing;

  const [template, company, ratioRaw] = await Promise.all([
    getSetting<string>("contract_template", DEFAULT_CONTRACT_TEMPLATE),
    getSetting<CompanyProfile>("company_profile", DEFAULT_COMPANY_PROFILE),
    getSetting<number>("deposit_ratio", DEFAULT_DEPOSIT_RATIO),
  ]);
  const md = renderContractMd(template, quote, company, normalizeDepositRatio(ratioRaw));

  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("contracts")
      .insert({
        quote_id: quote.id,
        client_name: quote.client_name ?? null,
        contact_email: quote.contact_email ?? null,
        content_md: md,
        status: "sent",
        public_token: randomToken(),
        sent_at: now,
      })
      .select(SELECT)
      .single();
    if (error || !data) {
      if (error) console.error("[contract] createContractFromQuote insert failed:", error.message);
      // 唯一索引（contracts_one_active_per_quote）擋下的併發重複 → 撿回贏家那筆；其他錯誤自然回 null。
      return getContractByQuoteId(quote.id);
    }
    let row = data as Contract;
    // {{contract_no}} 回填：insert 後才知道 DB sequence 產的編號。
    if (row.contract_no && row.content_md.includes("{{contract_no}}")) {
      const content = row.content_md.replace(/\{\{contract_no\}\}/g, row.contract_no);
      const { data: upd } = await supabase
        .from("contracts")
        .update({ content_md: content, updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .select(SELECT)
        .maybeSingle();
      if (upd) row = upd as Contract;
    }
    return row;
  } catch (err) {
    console.error("[contract] createContractFromQuote failed:", err);
    return null;
  }
}

export async function getContract(id: string): Promise<Contract | null> {
  const supabase = createAdminSupabase();
  if (!supabase || !id) return null;
  try {
    const { data, error } = await supabase.from("contracts").select(SELECT).eq("id", id).maybeSingle();
    if (error || !data) return null;
    return data as Contract;
  } catch {
    return null;
  }
}

export async function getContractByToken(token: string): Promise<Contract | null> {
  const supabase = createAdminSupabase();
  if (!supabase || !token) return null;
  try {
    const { data, error } = await supabase.from("contracts").select(SELECT).eq("public_token", token).maybeSingle();
    if (error || !data) return null;
    return data as Contract;
  } catch {
    return null;
  }
}

/** 同一張報價已有合約？（去重用）回最早建立的一份。 */
export async function getContractByQuoteId(quoteId: string): Promise<Contract | null> {
  const supabase = createAdminSupabase();
  if (!supabase || !quoteId) return null;
  try {
    const { data, error } = await supabase
      .from("contracts")
      .select(SELECT)
      .eq("quote_id", quoteId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return data as Contract;
  } catch {
    return null;
  }
}

/**
 * 依 token 簽署合約。僅 status='sent' 可簽；已簽回既有（冪等）；voided/draft/不存在回 null。
 * 條件式 update（status='sent' 才轉 signed）防併發重複簽。
 */
export async function signContractByToken(
  token: string,
  signer: { name: string; ip: string; userAgent: string }
): Promise<Contract | null> {
  const supabase = createAdminSupabase();
  if (!supabase || !token) return null;
  const cur = await getContractByToken(token);
  if (!cur) return null;
  if (cur.status === "signed") return cur; // 冪等：已簽回既有
  if (cur.status !== "sent") return null; // draft / voided 不可簽
  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("contracts")
      .update({
        status: "signed",
        signed_at: now,
        signer_name: String(signer.name ?? "").slice(0, 100),
        signer_ip: String(signer.ip ?? "").slice(0, 100),
        signer_user_agent: String(signer.userAgent ?? "").slice(0, 300),
        updated_at: now,
      })
      .eq("id", cur.id)
      .eq("status", "sent")
      .select(SELECT)
      .maybeSingle();
    if (error) {
      console.error("[contract] signContractByToken failed:", error.message);
      return null;
    }
    if (data) return data as Contract;
    // 併發下已被簽走 → 回既有簽署結果（冪等）。
    const again = await getContract(cur.id);
    return again && again.status === "signed" ? again : null;
  } catch (err) {
    console.error("[contract] signContractByToken failed:", err);
    return null;
  }
}

/** 作廢合約。成功回 true。 */
export async function voidContract(id: string): Promise<boolean> {
  const supabase = createAdminSupabase();
  if (!supabase || !id) return false;
  try {
    const { error } = await supabase
      .from("contracts")
      .update({ status: "voided", updated_at: new Date().toISOString() })
      .eq("id", id);
    return !error;
  } catch {
    return false;
  }
}
