import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminSupabase } from "@/lib/supabase";
import { getQuote, moneyTWD, type Quote } from "@/lib/quote";
import { getContract, type Contract } from "@/lib/contract";
import {
  getPayment,
  getPaymentsByCase,
  getPaymentsByQuote,
  createFinalForCase,
  PAYMENT_KIND_LABELS,
  type Payment,
} from "@/lib/payment";
import { getCase, type CaseStatus, type CaseSource } from "@/lib/adminCases";
import {
  sendWorkStartedEmail,
  sendClosingEmail,
  sendOwnerEventNotice,
  sendPaymentEmail,
} from "@/lib/resend";
import { ensurePortalToken, addUpdate } from "@/lib/portal";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gathertaiwan.com";

// 付款成功副作用引擎（冪等）：
//   訂金/全額 → 自動開案（進行中）＋開工信；尾款 → 自動結案＋感謝信。
// 冪等機制：client_cases.deposit_paid_at / final_paid_at 當處理標記——已設即跳過、不重寄信。

// 狀態字串鎖定 lib/adminCases.ts 的 CASE_STATUSES（CaseStatus 型別檢查擋 typo／擋清單外字串）。
const STATUS_IN_PROGRESS: CaseStatus = "進行中";
const STATUS_DONE: CaseStatus = "已完成";
const STATUS_CLOSED: CaseStatus = "已結案";

/** 案件列（含錢的閉環擴欄；lib/adminCases.ts 的 ClientCase 未含這些欄位，這裡自帶）。 */
type CaseMoneyRow = {
  id: string;
  title: string;
  client_name: string;
  status: string;
  quote_id: string | null;
  contract_id: string | null;
  deposit_paid_at: string | null;
  final_paid_at: string | null;
  closed_at: string | null;
  auto_opened: boolean;
};

const CASE_SELECT =
  "id, title, client_name, status, quote_id, contract_id, deposit_paid_at, final_paid_at, closed_at, auto_opened";

async function fetchCaseMoney(supabase: SupabaseClient, id: string | null | undefined): Promise<CaseMoneyRow | null> {
  if (!id) return null;
  try {
    const { data } = await supabase.from("client_cases").select(CASE_SELECT).eq("id", id).maybeSingle();
    return (data as CaseMoneyRow | null) ?? null;
  } catch {
    return null;
  }
}

/** 以 quote.session_id 配對既有案件（取最近更新的一筆）。 */
async function findCaseBySession(supabase: SupabaseClient, sessionId: string | null | undefined): Promise<CaseMoneyRow | null> {
  if (!sessionId) return null;
  try {
    const { data } = await supabase
      .from("client_cases")
      .select(CASE_SELECT)
      .eq("session_id", sessionId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as CaseMoneyRow | null) ?? null;
  } catch {
    return null;
  }
}

/** 找 payment 對應案件：payment.case_id → contract.case_id → quote.session_id 配對。 */
async function locateCase(
  supabase: SupabaseClient,
  payment: Payment,
  quote: Quote | null,
  contract: Contract | null
): Promise<CaseMoneyRow | null> {
  const byPayment = await fetchCaseMoney(supabase, payment.case_id);
  if (byPayment) return byPayment;
  const byContract = await fetchCaseMoney(supabase, contract?.case_id);
  if (byContract) return byContract;
  return findCaseBySession(supabase, quote?.session_id);
}

/** 從報價建新案件（直接以「進行中」＋deposit_paid_at 落地；quote 缺時退用 contract/payment 資訊）。 */
async function createCaseForPayment(
  supabase: SupabaseClient,
  payment: Payment,
  quote: Quote | null,
  contract: Contract | null
): Promise<CaseMoneyRow | null> {
  const items = quote && Array.isArray(quote.line_items) ? quote.line_items : [];
  const firstDesc = items[0]?.description?.trim();
  const title = firstDesc
    ? items.length > 1
      ? `${firstDesc} 等 ${items.length} 項`
      : firstDesc
    : payment.title || "委託開發案";
  const clientName = quote?.client_name || contract?.client_name || "未填姓名";
  const source: CaseSource = quote?.session_id ? "ai_chat" : "manual";
  const now = new Date().toISOString();
  try {
    const { data, error } = await supabase
      .from("client_cases")
      .insert({
        title: title.slice(0, 200),
        client_name: clientName.slice(0, 100),
        contact_email: quote?.contact_email ?? contract?.contact_email ?? null,
        contact_phone: quote?.contact_phone ?? null,
        contact_line: quote?.contact_line ?? null,
        source,
        status: STATUS_IN_PROGRESS,
        budget: quote?.total ?? payment.amount,
        currency: quote?.currency ?? "TWD",
        session_id: quote?.session_id ?? null,
        quote_id: payment.quote_id ?? null,
        contract_id: payment.contract_id ?? contract?.id ?? null,
        deposit_paid_at: payment.paid_at ?? now,
        auto_opened: true,
      })
      .select(CASE_SELECT)
      .single();
    if (error || !data) {
      if (error) console.error("[lifecycle] 自動開案 insert 失敗:", error.message);
      return null;
    }
    return data as CaseMoneyRow;
  } catch (err) {
    console.error("[lifecycle] 自動開案失敗:", err);
    return null;
  }
}

/** 回填關聯：payment.case_id、contract.case_id ← case.id。 */
async function backfillCaseLinks(
  supabase: SupabaseClient,
  caseId: string,
  payment: Payment,
  contract: Contract | null
): Promise<void> {
  const now = new Date().toISOString();
  try {
    if (!payment.case_id) {
      await supabase.from("payments").update({ case_id: caseId, updated_at: now }).eq("id", payment.id);
    }
    if (contract && !contract.case_id) {
      await supabase.from("contracts").update({ case_id: caseId, updated_at: now }).eq("id", contract.id);
    }
  } catch (err) {
    console.error("[lifecycle] 回填 case_id 失敗:", err);
  }
}

/** 訂金／全額入帳 → 自動開案＋開工信＋老闆通知。 */
async function onDepositPaid(supabase: SupabaseClient, payment: Payment): Promise<void> {
  const quote = payment.quote_id ? await getQuote(payment.quote_id) : null;
  const contract = payment.contract_id ? await getContract(payment.contract_id) : null;

  let caseRow = await locateCase(supabase, payment, quote, contract);
  let createdNew = false;
  if (!caseRow) {
    caseRow = await createCaseForPayment(supabase, payment, quote, contract);
    createdNew = true;
    if (!caseRow) {
      // 建不出案件也不能吞掉入帳事實 → 至少通知老闆。
      await sendOwnerEventNotice(`💰 ${PAYMENT_KIND_LABELS[payment.kind]}入帳（自動開案失敗，請手動開案）`, [
        `款項：${payment.title ?? "—"}（${payment.payment_no ?? "—"}）`,
        `金額：${moneyTWD(payment.amount)}`,
        `方式：${payment.method ?? "—"}`,
      ]);
      return;
    }
  }

  // 冪等：deposit_paid_at 已設＝這筆案件的訂金副作用已處理過 → 不重更新、不重寄信。
  if (!createdNew) {
    if (caseRow.deposit_paid_at) return;
    const now = new Date().toISOString();
    const upd: Record<string, unknown> = {
      deposit_paid_at: payment.paid_at ?? now,
      auto_opened: true,
      updated_at: now,
    };
    // 不把已完成/已結案的案件倒退回進行中。
    if (caseRow.status !== STATUS_DONE && caseRow.status !== STATUS_CLOSED) upd.status = STATUS_IN_PROGRESS;
    if (payment.quote_id && !caseRow.quote_id) upd.quote_id = payment.quote_id;
    if ((payment.contract_id ?? contract?.id) && !caseRow.contract_id) upd.contract_id = payment.contract_id ?? contract?.id;
    const { error } = await supabase.from("client_cases").update(upd).eq("id", caseRow.id);
    if (error) {
      console.error("[lifecycle] 開案 update 失敗:", error.message);
      return; // 標記沒落地就不寄信，留給下一次 notify 重試。
    }
  }

  await backfillCaseLinks(supabase, caseRow.id, payment, contract);

  // P1：開案即掛 portal token，開工信附客戶專屬進度頁連結（token 拿不到就寄原版開工信）。
  const portalToken = await ensurePortalToken(caseRow.id);
  const portalUrl = portalToken ? `${SITE_URL}/portal/${portalToken}` : undefined;

  await sendWorkStartedEmail(payment, portalUrl);
  await sendOwnerEventNotice(`💰 ${PAYMENT_KIND_LABELS[payment.kind]}入帳，案件已自動開案：${caseRow.client_name}`, [
    `案件：${caseRow.title}`,
    `款項：${payment.title ?? "—"}（${payment.payment_no ?? "—"}）`,
    `金額：${moneyTWD(payment.amount)}`,
    `方式：${payment.method ?? "—"}`,
    quote?.quote_no ? `報價單：${quote.quote_no}` : "",
  ]);
}

/** 尾款入帳 → 自動結案＋感謝信＋老闆通知。 */
async function onFinalPaid(supabase: SupabaseClient, payment: Payment): Promise<void> {
  const quote = payment.quote_id ? await getQuote(payment.quote_id) : null;
  const contract = payment.contract_id ? await getContract(payment.contract_id) : null;

  const caseRow = await locateCase(supabase, payment, quote, contract);
  if (!caseRow) {
    await sendOwnerEventNotice(`💰 尾款入帳（未配對到案件，請手動結案）`, [
      `款項：${payment.title ?? "—"}（${payment.payment_no ?? "—"}）`,
      `金額：${moneyTWD(payment.amount)}`,
      `方式：${payment.method ?? "—"}`,
    ]);
    return;
  }

  // 冪等：final_paid_at 已設＝尾款副作用已處理過 → 不重更新、不重寄信。
  if (caseRow.final_paid_at) return;

  const now = new Date().toISOString();
  const upd: Record<string, unknown> = {
    status: STATUS_CLOSED,
    final_paid_at: payment.paid_at ?? now,
    closed_at: caseRow.closed_at ?? now,
    updated_at: now,
  };
  if (payment.quote_id && !caseRow.quote_id) upd.quote_id = payment.quote_id;
  if ((payment.contract_id ?? contract?.id) && !caseRow.contract_id) upd.contract_id = payment.contract_id ?? contract?.id;
  const { error } = await supabase.from("client_cases").update(upd).eq("id", caseRow.id);
  if (error) {
    console.error("[lifecycle] 結案 update 失敗:", error.message);
    return; // 標記沒落地就不寄信，留給下一次 notify 重試。
  }

  await backfillCaseLinks(supabase, caseRow.id, payment, contract);

  await sendClosingEmail(payment);
  await sendOwnerEventNotice(`✅ 尾款入帳，案件已自動結案：${caseRow.client_name}`, [
    `案件：${caseRow.title}`,
    `款項：${payment.title ?? "—"}（${payment.payment_no ?? "—"}）`,
    `金額：${moneyTWD(payment.amount)}`,
    `方式：${payment.method ?? "—"}`,
    quote?.quote_no ? `報價單：${quote.quote_no}` : "",
  ]);
}

/**
 * 付款成功副作用引擎（呼叫端規則：markPaymentPaid 回 transitioned===true 才呼叫）。
 * - kind deposit/full：找 case（payment.case_id → contract.case_id → quote.session_id 配對 → 建新 case）
 *   → status「進行中」、deposit_paid_at、auto_opened、回填關聯 → 開工信＋老闆通知。
 * - kind final：case →「已結案」、final_paid_at、closed_at → 感謝信＋老闆通知。
 * - kind custom：不動案件，只通知老闆入帳。
 * 冪等：case 的 deposit_paid_at / final_paid_at 已設即跳過（不重寄信）；本函式不 throw。
 */
export async function handlePaymentPaid(paymentId: string): Promise<void> {
  const supabase = createAdminSupabase();
  if (!supabase || !paymentId) return;
  const payment = await getPayment(paymentId);
  if (!payment || payment.status !== "paid") return; // 只處理真的已付款者

  try {
    if (payment.kind === "deposit" || payment.kind === "full") {
      await onDepositPaid(supabase, payment);
    } else if (payment.kind === "final") {
      await onFinalPaid(supabase, payment);
    } else {
      await sendOwnerEventNotice(`💰 款項入帳：${payment.title ?? PAYMENT_KIND_LABELS[payment.kind]}`, [
        `單號：${payment.payment_no ?? "—"}`,
        `金額：${moneyTWD(payment.amount)}`,
        `方式：${payment.method ?? "—"}`,
      ]);
    }
  } catch (err) {
    console.error("[lifecycle] handlePaymentPaid failed:", err);
  }
}

// ─────────────────────────────────────────────────────────────
// 完工 → 請尾款（後台「標記完工」與 portal 最終交付驗收共用的編排）
// ─────────────────────────────────────────────────────────────

/** 該案件相關的所有請款單（case_id ∪ quote_id，去重）。 */
async function paymentsOfCase(caseId: string, quoteId: string | null): Promise<Payment[]> {
  const [byCase, byQuote] = await Promise.all([
    getPaymentsByCase(caseId),
    quoteId ? getPaymentsByQuote(quoteId) : Promise.resolve([] as Payment[]),
  ]);
  const seen = new Set<string>();
  return [...byCase, ...byQuote].filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
}

/**
 * 完工編排（自 /api/admin/cases/complete 抽出；行為等價）：
 * case →「已完成」→ 作廢仍 pending 的訂金單（計數供通知文案；實際作廢由
 * createFinalForCase 內的 voidPendingDeposits 統一執行——單一寫入者，會 merge
 * raw_response.voided_reason 供付款頁顯示與稽核）→ 產尾款請款單（total − 實付訂金）
 * → 寫一筆 system 動態 → 寄驗收＋尾款信給客人、事件通知給老闆。
 * 冪等：已有尾款單（同 case 或同 quote）→ { already:true } 回既有單，不重產、不重寄。
 * 失敗（supabase 未設定／case 不存在／case 更新失敗）→ { ok:false }。
 */
export async function completeCaseAndRequestFinal(
  caseId: string
): Promise<{ ok: boolean; paymentId: string | null; emailed: boolean; already: boolean }> {
  const fail = { ok: false, paymentId: null, emailed: false, already: false };
  const supabase = createAdminSupabase();
  if (!supabase || !caseId) return fail;

  const caseRow = await getCase(caseId);
  if (!caseRow) return fail;

  // ── 冪等：已有尾款單 → 完工流程跑過了，回既有單（不重產、不重寄信）──
  const existingFinal = (await paymentsOfCase(caseRow.id, caseRow.quote_id)).find((p) => p.kind === "final");
  if (existingFinal) return { ok: true, paymentId: existingFinal.id, emailed: false, already: true };

  const now = new Date().toISOString();

  // ── case →「已完成」（已結案不倒退）──
  if (caseRow.status !== STATUS_DONE && caseRow.status !== STATUS_CLOSED) {
    const { error } = await supabase
      .from("client_cases")
      .update({ status: STATUS_DONE, updated_at: now })
      .eq("id", caseRow.id);
    if (error) {
      console.error("[lifecycle] complete case update failed:", error.message);
      return fail;
    }
  }

  // ── 數一下仍 pending 的訂金單（僅供通知文案）──
  let voidedDeposits = 0;
  try {
    const orFilter = caseRow.quote_id
      ? `case_id.eq.${caseRow.id},quote_id.eq.${caseRow.quote_id}`
      : `case_id.eq.${caseRow.id}`;
    const { data: pendingDeposits } = await supabase
      .from("payments")
      .select("id")
      .eq("kind", "deposit")
      .eq("status", "pending")
      .or(orFilter);
    voidedDeposits = pendingDeposits?.length ?? 0;
  } catch (err) {
    console.error("[lifecycle] count pending deposit failed:", err);
  }

  // ── 產尾款請款單（total − 已付訂金/全額）──
  const finalRes = await createFinalForCase(caseRow);

  // DB/資料異常：不可與「無需請款」混淆——告警老闆、回 ok:false 讓呼叫端可重試（流程冪等）。
  if (finalRes.error) {
    console.error("[lifecycle] 完工已標記但開立尾款失敗（case:", caseRow.id, "）");
    await sendOwnerEventNotice(`⚠️ 完工已標記，但開立尾款請款單失敗：${caseRow.client_name}`, [
      `案件：${caseRow.title}`,
      "請至後台案件詳情重按「標記完工並請尾款」重試（流程冪等、不會重複開單）。",
    ]);
    return { ok: false, paymentId: null, emailed: false, already: false };
  }

  const payment = finalRes.payment;

  if (!payment) {
    // 真的無需請款（無關聯報價或已付清）。
    await addUpdate(caseRow.id, "system", "專案已完工");
    await sendOwnerEventNotice(`✅ 案件已標記完工（無需請款）：${caseRow.client_name}`, [
      `案件：${caseRow.title}`,
      "未產生尾款請款單（沒有關聯報價，或款項已付清）。",
      voidedDeposits > 0 ? `已作廢 ${voidedDeposits} 張未付款的訂金單。` : "",
    ]);
    return { ok: true, paymentId: null, emailed: false, already: false };
  }

  if (!finalRes.created) {
    // 併發輸家（portal 驗收與後台完工同時按下）：贏家已寄信＋寫動態，這裡靜默收斂——請款信恰好一封。
    return { ok: true, paymentId: payment.id, emailed: false, already: true };
  }

  // ── system 動態（portal timeline；只有新建者寫，避免重複兩筆）──
  await addUpdate(caseRow.id, "system", `專案已完工，已開立尾款請款單（${moneyTWD(payment.amount)}）`);

  // ── 寄驗收＋尾款信給客人、事件通知給老闆（只有新建者寄）──
  const emailed = await sendPaymentEmail(payment);
  await sendOwnerEventNotice(`✅ 案件已標記完工，尾款請款單已建立：${caseRow.client_name}`, [
    `案件：${caseRow.title}`,
    `尾款：${moneyTWD(payment.amount)}（${payment.payment_no ?? "—"}）`,
    voidedDeposits > 0 ? `已作廢 ${voidedDeposits} 張未付款的訂金單（尾款以全額計）。` : "",
    emailed ? "請款信已寄給客戶。" : "⚠️ 請款信未寄出（客戶 Email 缺漏或寄信未設定），可到案件詳情複製付款連結補寄。",
  ]);

  return { ok: true, paymentId: payment.id, emailed, already: false };
}
