import { createAdminSupabase } from "@/lib/supabase";
import { randomToken, getQuote } from "@/lib/quote";
import { depositAmounts, type Contract } from "@/lib/contract";
import { getSetting, DEFAULT_DEPOSIT_RATIO } from "@/lib/settings";
import type { ClientCase } from "@/lib/adminCases";

// 請款單（payments 表）：合約簽署後產訂金單、案件完工後產尾款單 → 客人於 /pay/<token> 付款。
// method 值域：pchomepay_credit | pchomepay_atm | bank_transfer | manual

export type PaymentKind = "deposit" | "final" | "full" | "custom";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

export type Payment = {
  id: string;
  payment_no: string | null;
  case_id: string | null;
  quote_id: string | null;
  contract_id: string | null;
  kind: PaymentKind;
  title: string | null;
  amount: number;
  status: PaymentStatus;
  method: string | null;
  public_token: string | null;
  gateway_order_no: string | null;
  gateway_trade_no: string | null;
  atm_bank_code: string | null;
  atm_v_account: string | null;
  atm_expire_date: string | null;
  paid_at: string | null;
  reminded_at: string | null;
  created_at: string;
  updated_at: string;
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "待付款",
  paid: "已付款",
  failed: "失敗",
  refunded: "已退款",
};

/**
 * 狀態 chip className（同 CONTRACT_STATUS_COLORS 慣例；顏色語意：
 * pending 黃、paid 綠、failed 紅、refunded 灰）。樣式類別由使用端於 globals.css 定義。
 */
export const PAYMENT_STATUS_COLORS: Record<PaymentStatus, string> = {
  pending: "gt-status-chip gt-status-chip--pending",
  paid: "gt-status-chip gt-status-chip--paid",
  failed: "gt-status-chip gt-status-chip--failed",
  refunded: "gt-status-chip gt-status-chip--refunded",
};

export const PAYMENT_KIND_LABELS: Record<PaymentKind, string> = {
  deposit: "訂金",
  final: "尾款",
  full: "全額",
  custom: "其他",
};

const SELECT =
  "id, payment_no, case_id, quote_id, contract_id, kind, title, amount, status, method, public_token, gateway_order_no, gateway_trade_no, atm_bank_code, atm_v_account, atm_expire_date, paid_at, reminded_at, created_at, updated_at";

/** 訂金比例合法性（0 < r < 1），不合法回預設。 */
function normalizeDepositRatio(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n < 1 ? n : DEFAULT_DEPOSIT_RATIO;
}

/** 依 kind 找既有請款單（去重用；quote → contract → case 逐一嘗試，回最早的一筆）。 */
async function findExistingPayment(opts: {
  quoteId?: string | null;
  contractId?: string | null;
  caseId?: string | null;
  kind: PaymentKind;
}): Promise<Payment | null> {
  const supabase = createAdminSupabase();
  if (!supabase) return null;
  const tryOne = async (col: "quote_id" | "contract_id" | "case_id", val: string): Promise<Payment | null> => {
    const { data } = await supabase
      .from("payments")
      .select(SELECT)
      .eq(col, val)
      .eq("kind", opts.kind)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    return (data as Payment | null) ?? null;
  };
  try {
    if (opts.quoteId) {
      const hit = await tryOne("quote_id", opts.quoteId);
      if (hit) return hit;
    }
    if (opts.contractId) {
      const hit = await tryOne("contract_id", opts.contractId);
      if (hit) return hit;
    }
    if (opts.caseId) {
      const hit = await tryOne("case_id", opts.caseId);
      if (hit) return hit;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 建立尾款前的防重複收款：把同 case／同 quote 下仍 pending 的訂金單全部作廢
 * （status 'pending'→'failed'，raw_response merge {voided_reason:"final_created"}）。回作廢筆數。
 * 併發安全：每列都用「條件式 update（where id=X and status='pending' and kind='deposit'）」，
 * 與 markPaymentPaid 的 pending 條件互斥——同一列恰好一方生效（已轉 paid 的不會被作廢、
 * 已作廢的 markPaymentPaid 拿不到列 → transitioned:false → 不觸發付款副作用）。
 */
async function voidPendingDeposits(caseId: string | null, quoteId: string | null): Promise<number> {
  const supabase = createAdminSupabase();
  if (!supabase || (!caseId && !quoteId)) return 0;
  let voided = 0;
  try {
    let sel = supabase.from("payments").select("id, raw_response").eq("kind", "deposit").eq("status", "pending");
    if (caseId && quoteId) sel = sel.or(`case_id.eq.${caseId},quote_id.eq.${quoteId}`);
    else if (caseId) sel = sel.eq("case_id", caseId);
    else if (quoteId) sel = sel.eq("quote_id", quoteId);
    const { data: rows } = await sel;
    for (const r of rows ?? []) {
      const row = r as { id: string; raw_response: unknown };
      // raw_response 為物件就 merge，否則直接設（jsonb merge 在 app 層做，配合條件式 update 不會蓋到已付列）。
      const merged =
        row.raw_response && typeof row.raw_response === "object" && !Array.isArray(row.raw_response)
          ? { ...(row.raw_response as Record<string, unknown>), voided_reason: "final_created" }
          : { voided_reason: "final_created" };
      const { data: upd } = await supabase
        .from("payments")
        .update({ status: "failed", raw_response: merged, updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("status", "pending") // 條件式：併發下若已被 markPaymentPaid 轉 paid → 0 列、不覆蓋
        .eq("kind", "deposit")
        .select("id");
      if (upd && upd.length > 0) voided += 1;
    }
  } catch (err) {
    console.error("[payment] voidPendingDeposits failed:", err);
  }
  if (voided > 0) {
    console.log(`[payment] createFinalForCase：作廢 ${voided} 筆未付訂金（voided_reason=final_created）`);
  }
  return voided;
}

/** 建請款單（status='pending'，public_token 自產）。金額 <= 0 回 null。 */
export async function createPayment(input: {
  case_id?: string | null;
  quote_id?: string | null;
  contract_id?: string | null;
  kind: PaymentKind;
  title: string;
  amount: number;
}): Promise<Payment | null> {
  const supabase = createAdminSupabase();
  if (!supabase) return null;
  const amount = Math.round(Number(input.amount) || 0);
  if (amount <= 0) return null;
  try {
    const { data, error } = await supabase
      .from("payments")
      .insert({
        case_id: input.case_id ?? null,
        quote_id: input.quote_id ?? null,
        contract_id: input.contract_id ?? null,
        kind: input.kind,
        title: String(input.title ?? "").slice(0, 200) || null,
        amount,
        status: "pending",
        public_token: randomToken(),
      })
      .select(SELECT)
      .single();
    if (error || !data) {
      if (error) console.error("[payment] createPayment failed:", error.message);
      return null;
    }
    return data as Payment;
  } catch (err) {
    console.error("[payment] createPayment failed:", err);
    return null;
  }
}

/**
 * 合約簽署後建「訂金」請款單：讀 quote total＋settings 訂金比例 → depositAmounts。
 * 冪等：同 quote（fallback：同 contract）已有 deposit → 回既有，不重複建立。
 */
export async function createDepositForContract(contract: Contract): Promise<Payment | null> {
  if (!contract?.id) return null;

  const existing = await findExistingPayment({ quoteId: contract.quote_id, contractId: contract.id, kind: "deposit" });
  if (existing) return existing;

  if (!contract.quote_id) return null;
  const quote = await getQuote(contract.quote_id);
  const total = Math.round(Number(quote?.total) || 0);
  if (!quote || total <= 0) return null;

  const ratio = normalizeDepositRatio(await getSetting<number>("deposit_ratio", DEFAULT_DEPOSIT_RATIO));
  const { deposit } = depositAmounts(total, ratio);
  if (deposit <= 0) return null;

  const created = await createPayment({
    case_id: contract.case_id ?? null,
    quote_id: contract.quote_id,
    contract_id: contract.id,
    kind: "deposit",
    title: `訂金（${Math.round(ratio * 100)}%）`,
    amount: deposit,
  });
  if (created) return created;
  // 唯一索引（payments_one_active_deposit_per_quote）擋下的併發重複 → 撿回贏家那筆。
  return findExistingPayment({ quoteId: contract.quote_id, contractId: contract.id, kind: "deposit" });
}

/**
 * 案件完工後建「尾款」請款單：依 case 的 quote total −「已付」訂金/全額。
 * 冪等：同 case（或同 quote）已有 final → 回既有；金額 <= 0（含已付清）回 null。
 * 註：ClientCase 型別未含金流擴欄，quote_id/contract_id 直接查 DB。
 */
export async function createFinalForCase(caseRow: ClientCase): Promise<Payment | null> {
  if (!caseRow?.id) return null;
  const supabase = createAdminSupabase();
  if (!supabase) return null;

  const existingByCase = await findExistingPayment({ caseId: caseRow.id, kind: "final" });
  if (existingByCase) return existingByCase;

  let quoteId: string | null = null;
  let contractId: string | null = null;
  try {
    const { data } = await supabase
      .from("client_cases")
      .select("quote_id, contract_id")
      .eq("id", caseRow.id)
      .maybeSingle();
    quoteId = (data?.quote_id as string | null) ?? null;
    contractId = (data?.contract_id as string | null) ?? null;
  } catch {
    return null;
  }
  if (!quoteId) return null;

  const existingByQuote = await findExistingPayment({ quoteId, kind: "final" });
  if (existingByQuote) return existingByQuote;

  // 建立尾款前：先作廢同 case/quote 仍未付的訂金單，再計算「已付」金額。
  // 順序是併發安全的關鍵——作廢在前、加總在後：訂金若搶先變 paid 會被計入下方 paidSoFar
  // （尾款自動扣除）；若被這裡作廢，之後的 notify 走 markPaymentPaid 也拿不到 pending 列，
  // 兩條路都不會重複收款。
  await voidPendingDeposits(caseRow.id, quoteId);

  const quote = await getQuote(quoteId);
  const total = Math.round(Number(quote?.total) || 0);
  if (!quote || total <= 0) return null;

  let paidSoFar = 0;
  try {
    const { data: paidRows } = await supabase
      .from("payments")
      .select("amount")
      .eq("quote_id", quoteId)
      .eq("status", "paid")
      .in("kind", ["deposit", "full"]);
    paidSoFar = (paidRows ?? []).reduce((s, r) => s + (Number((r as { amount: unknown }).amount) || 0), 0);
  } catch {
    return null;
  }

  const amount = Math.round(total - paidSoFar);
  if (amount <= 0) return null;

  const created = await createPayment({
    case_id: caseRow.id,
    quote_id: quoteId,
    contract_id: contractId,
    kind: "final",
    title: "尾款",
    amount,
  });
  if (created) return created;
  // 唯一索引（payments_one_active_final_per_quote）擋下的併發重複 → 撿回贏家那筆。
  return findExistingPayment({ quoteId, kind: "final" });
}

export async function getPayment(id: string): Promise<Payment | null> {
  const supabase = createAdminSupabase();
  if (!supabase || !id) return null;
  try {
    const { data, error } = await supabase.from("payments").select(SELECT).eq("id", id).maybeSingle();
    if (error || !data) return null;
    return data as Payment;
  } catch {
    return null;
  }
}

export async function getPaymentByToken(token: string): Promise<Payment | null> {
  const supabase = createAdminSupabase();
  if (!supabase || !token) return null;
  try {
    const { data, error } = await supabase.from("payments").select(SELECT).eq("public_token", token).maybeSingle();
    if (error || !data) return null;
    return data as Payment;
  } catch {
    return null;
  }
}

export async function getPaymentsByCase(caseId: string): Promise<Payment[]> {
  const supabase = createAdminSupabase();
  if (!supabase || !caseId) return [];
  try {
    const { data, error } = await supabase
      .from("payments")
      .select(SELECT)
      .eq("case_id", caseId)
      .order("created_at", { ascending: true });
    if (error || !data) return [];
    return data as Payment[];
  } catch {
    return [];
  }
}

export async function getPaymentsByQuote(quoteId: string): Promise<Payment[]> {
  const supabase = createAdminSupabase();
  if (!supabase || !quoteId) return [];
  try {
    const { data, error } = await supabase
      .from("payments")
      .select(SELECT)
      .eq("quote_id", quoteId)
      .order("created_at", { ascending: true });
    if (error || !data) return [];
    return data as Payment[];
  } catch {
    return [];
  }
}

/** 綁定閘道訂單編號（我方送閘道的 order no → payments.gateway_order_no）。 */
export async function attachGatewayOrder(id: string, orderNo: string): Promise<boolean> {
  const supabase = createAdminSupabase();
  if (!supabase || !id || !orderNo) return false;
  try {
    const { error } = await supabase
      .from("payments")
      .update({ gateway_order_no: orderNo, updated_at: new Date().toISOString() })
      .eq("id", id);
    return !error;
  } catch {
    return false;
  }
}

/** 記 ATM 取號資訊（銀行代碼／虛擬帳號／繳費期限；raw 存 raw_response）。 */
export async function recordAtmInfo(
  id: string,
  info: { bankCode: string; vAccount: string; expireDate: string; raw?: unknown }
): Promise<boolean> {
  const supabase = createAdminSupabase();
  if (!supabase || !id) return false;
  try {
    const upd: Record<string, unknown> = {
      atm_bank_code: String(info.bankCode ?? "").slice(0, 20),
      atm_v_account: String(info.vAccount ?? "").slice(0, 50),
      atm_expire_date: String(info.expireDate ?? "").slice(0, 50),
      updated_at: new Date().toISOString(),
    };
    if (info.raw !== undefined) upd.raw_response = info.raw;
    const { error } = await supabase.from("payments").update(upd).eq("id", id);
    return !error;
  } catch {
    return false;
  }
}

/**
 * 標記已付款（pending→paid 恰好一次）。
 * 冪等／防併發：條件式 update（where id=X **and status='pending'**）——
 * 搶到轉換的那一次拿到更新列 → transitioned:true（呼叫端僅此時觸發 handlePaymentPaid 副作用）；
 * 沒搶到（已 paid／failed／refunded）→ 回既有列 transitioned:false，不重複副作用；查無回 null。
 */
export async function markPaymentPaid(
  id: string,
  patch: { method: string; gateway_trade_no?: string; raw_response?: unknown }
): Promise<{ payment: Payment; transitioned: boolean } | null> {
  const supabase = createAdminSupabase();
  if (!supabase || !id) return null;
  try {
    const now = new Date().toISOString();
    const upd: Record<string, unknown> = { status: "paid", paid_at: now, method: patch.method, updated_at: now };
    if (patch.gateway_trade_no) upd.gateway_trade_no = patch.gateway_trade_no;
    if (patch.raw_response !== undefined) upd.raw_response = patch.raw_response;
    const { data, error } = await supabase
      .from("payments")
      .update(upd)
      .eq("id", id)
      .eq("status", "pending") // 條件式 update：只有 pending 那一列會被轉 paid
      .select(SELECT)
      .maybeSingle();
    if (error) {
      console.error("[payment] markPaymentPaid update failed:", error.message);
      return null;
    }
    if (data) return { payment: data as Payment, transitioned: true };
    // 沒搶到轉換：回既有列（已 paid 等）；查無回 null。
    const cur = await getPayment(id);
    return cur ? { payment: cur, transitioned: false } : null;
  } catch (err) {
    console.error("[payment] markPaymentPaid failed:", err);
    return null;
  }
}
