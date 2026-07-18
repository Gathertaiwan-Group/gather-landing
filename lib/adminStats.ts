import { createAdminSupabase } from "@/lib/supabase";

// 後台營運報表：轉換漏斗（對話→…→結案）＋錢（本月營收／應收／累計）。
// 全部走 service_role（createAdminSupabase）。查詢個別 try/catch → 失敗回 0，
// 絕不整體崩（單一表壞掉不影響其他數字與整頁渲染）。

export type FunnelStats = {
  chats: number; // ai_chat_logs 總數
  chatsWithContact: number; // has_contact=true
  quotes: number; // quotes 總數
  quotesAccepted: number; // 已接受（accepted_at 非空）
  contractsSigned: number; // contracts status='signed'
  depositsPaid: number; // 已收訂金：payments kind='deposit' status='paid' 的 distinct quote/case
  casesInProgress: number; // client_cases status='進行中'
  casesClosed: number; // client_cases status='已結案'
};

export type RevenueStats = {
  paidThisMonth: number; // status='paid' 且 paid_at 落在本月（Asia/Taipei）之金額加總
  receivable: number; // status='pending' 金額加總（應收帳款）
  paidAllTime: number; // status='paid' 金額加總（累計營收）
};

type CountResult = { count: number | null; error: unknown };

/** 執行一個 count(head:true) 查詢並吞錯：出錯或例外一律回 0。 */
async function countSafe(run: () => PromiseLike<CountResult>): Promise<number> {
  try {
    const { count, error } = await run();
    return error ? 0 : count ?? 0;
  } catch {
    return 0;
  }
}

/** 已收訂金的 distinct 案子數：以 quote_id 優先、case_id 次之當去重鍵。出錯回 0。 */
async function countDepositsPaid(): Promise<number> {
  const supabase = createAdminSupabase();
  if (!supabase) return 0;
  try {
    const { data, error } = await supabase
      .from("payments")
      .select("case_id, quote_id")
      .eq("kind", "deposit")
      .eq("status", "paid");
    if (error || !data) return 0;
    const seen = new Set<string>();
    for (const r of data as Array<{ case_id: string | null; quote_id: string | null }>) {
      const key = r.quote_id || r.case_id; // 一張報價一筆訂金；退而以 case 去重
      if (key) seen.add(key);
    }
    return seen.size;
  } catch {
    return 0;
  }
}

/** 轉換漏斗各段計數。單次多查詢彙總；每段個別失敗回 0，不整體崩。 */
export async function getFunnelStats(): Promise<FunnelStats> {
  const supabase = createAdminSupabase();
  if (!supabase) {
    return {
      chats: 0,
      chatsWithContact: 0,
      quotes: 0,
      quotesAccepted: 0,
      contractsSigned: 0,
      depositsPaid: 0,
      casesInProgress: 0,
      casesClosed: 0,
    };
  }

  const [chats, chatsWithContact, quotes, quotesAccepted, contractsSigned, casesInProgress, casesClosed, depositsPaid] =
    await Promise.all([
      countSafe(() => supabase.from("ai_chat_logs").select("*", { count: "exact", head: true })),
      countSafe(() => supabase.from("ai_chat_logs").select("*", { count: "exact", head: true }).eq("has_contact", true)),
      countSafe(() => supabase.from("quotes").select("*", { count: "exact", head: true })),
      countSafe(() =>
        supabase.from("quotes").select("*", { count: "exact", head: true }).not("accepted_at", "is", null)
      ),
      countSafe(() =>
        supabase.from("contracts").select("*", { count: "exact", head: true }).eq("status", "signed")
      ),
      countSafe(() =>
        supabase.from("client_cases").select("*", { count: "exact", head: true }).eq("status", "進行中")
      ),
      countSafe(() =>
        supabase.from("client_cases").select("*", { count: "exact", head: true }).eq("status", "已結案")
      ),
      countDepositsPaid(),
    ]);

  return {
    chats,
    chatsWithContact,
    quotes,
    quotesAccepted,
    contractsSigned,
    depositsPaid,
    casesInProgress,
    casesClosed,
  };
}

/** 營收概況。金額用 select amount 後 JS reduce（payments 資料量小）。查詢個別失敗回 0。 */
export async function getRevenueStats(): Promise<RevenueStats> {
  const supabase = createAdminSupabase();
  if (!supabase) return { paidThisMonth: 0, receivable: 0, paidAllTime: 0 };

  // 本月起點：以 Asia/Taipei（UTC+8）當月 1 號 00:00 為界，換算成毫秒後與 paid_at 比對。
  // paid_at 為 timestamptz（存 UTC）→ 用 Date().getTime() 比較，避免不同 ISO 字串格式的字典序陷阱。
  const nowMs = Date.now();
  const taipei = new Date(nowMs + 8 * 3600000);
  const monthStartMs = Date.UTC(taipei.getUTCFullYear(), taipei.getUTCMonth(), 1) - 8 * 3600000;

  let paidThisMonth = 0;
  let paidAllTime = 0;
  try {
    const { data, error } = await supabase.from("payments").select("amount, paid_at").eq("status", "paid");
    if (!error && data) {
      for (const r of data as Array<{ amount: number | null; paid_at: string | null }>) {
        const amt = Number(r.amount) || 0;
        paidAllTime += amt;
        if (r.paid_at && new Date(r.paid_at).getTime() >= monthStartMs) paidThisMonth += amt;
      }
    }
  } catch {
    paidThisMonth = 0;
    paidAllTime = 0;
  }

  let receivable = 0;
  try {
    const { data, error } = await supabase.from("payments").select("amount").eq("status", "pending");
    if (!error && data) {
      receivable = (data as Array<{ amount: number | null }>).reduce((s, r) => s + (Number(r.amount) || 0), 0);
    }
  } catch {
    receivable = 0;
  }

  return { paidThisMonth, receivable, paidAllTime };
}

/** 轉換率百分比（分母 0 回 0）；回 0–100 整數。 */
export function pct(numer: number, denom: number): number {
  if (!denom || denom <= 0) return 0;
  const v = Math.round((numer / denom) * 100);
  return v < 0 ? 0 : v > 100 ? 100 : v;
}
