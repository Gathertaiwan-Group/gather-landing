import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase";
import { getCase } from "@/lib/adminCases";
import { createFinalForCase, getPaymentsByCase, getPaymentsByQuote, type Payment } from "@/lib/payment";
import { sendPaymentEmail, sendOwnerEventNotice } from "@/lib/resend";
import { moneyTWD } from "@/lib/quote";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 由 middleware（/api/admin/:path*）保護，這裡不再重覆驗證。

// 完工：case →「已完成」→ 作廢仍 pending 的訂金單 → 產尾款請款單（total − 實付訂金）
// → 寄驗收＋尾款信給客人、事件通知給老闆。
// 冪等：已有尾款單（同 case 或同 quote）→ 直接回既有單，不重產、不重寄。

const STATUS_DONE = "已完成";
const STATUS_CLOSED = "已結案";

/** 該案件相關的所有請款單（case_id ∪ quote_id，去重）。 */
async function paymentsOfCase(caseId: string, quoteId: string | null): Promise<Payment[]> {
  const [byCase, byQuote] = await Promise.all([
    getPaymentsByCase(caseId),
    quoteId ? getPaymentsByQuote(quoteId) : Promise.resolve([] as Payment[]),
  ]);
  const seen = new Set<string>();
  return [...byCase, ...byQuote].filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const id = body.id ? String(body.id) : null;
  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 422 });

  const supabase = createAdminSupabase();
  if (!supabase) return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });

  const caseRow = await getCase(id);
  if (!caseRow) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  // ── 冪等：已有尾款單 → 完工流程跑過了，回既有單（不重產、不重寄信）──
  const existingFinal = (await paymentsOfCase(caseRow.id, caseRow.quote_id)).find((p) => p.kind === "final");
  if (existingFinal) {
    return NextResponse.json({ ok: true, paymentId: existingFinal.id, already: true });
  }

  const now = new Date().toISOString();

  // ── case →「已完成」（已結案不倒退）──
  if (caseRow.status !== STATUS_DONE && caseRow.status !== STATUS_CLOSED) {
    const { error } = await supabase
      .from("client_cases")
      .update({ status: STATUS_DONE, updated_at: now })
      .eq("id", caseRow.id);
    if (error) {
      console.error("[admin/cases/complete] case update failed:", error.message);
      return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
    }
  }

  // ── 數一下仍 pending 的訂金單（僅供通知文案；實際作廢由 createFinalForCase 內的
  //    voidPendingDeposits 統一執行——單一寫入者，會 merge raw_response.voided_reason 供
  //    付款頁顯示「已由新的請款單取代」與稽核）──
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
    console.error("[admin/cases/complete] count pending deposit failed:", err);
  }

  // ── 產尾款請款單（A lib：total − 已付訂金/全額；無報價或已付清回 null）──
  const payment = await createFinalForCase(caseRow);
  if (!payment) {
    await sendOwnerEventNotice(`✅ 案件已標記完工（無需請款）：${caseRow.client_name}`, [
      `案件：${caseRow.title}`,
      "未產生尾款請款單（沒有關聯報價，或款項已付清）。",
      voidedDeposits > 0 ? `已作廢 ${voidedDeposits} 張未付款的訂金單。` : "",
    ]);
    return NextResponse.json({ ok: true, paymentId: null, emailed: false });
  }

  // ── 寄驗收＋尾款信給客人、事件通知給老闆 ──
  const emailed = await sendPaymentEmail(payment);
  await sendOwnerEventNotice(`✅ 案件已標記完工，尾款請款單已建立：${caseRow.client_name}`, [
    `案件：${caseRow.title}`,
    `尾款：${moneyTWD(payment.amount)}（${payment.payment_no ?? "—"}）`,
    voidedDeposits > 0 ? `已作廢 ${voidedDeposits} 張未付款的訂金單（尾款以全額計）。` : "",
    emailed ? "請款信已寄給客戶。" : "⚠️ 請款信未寄出（客戶 Email 缺漏或寄信未設定），可到案件詳情複製付款連結補寄。",
  ]);

  return NextResponse.json({ ok: true, paymentId: payment.id, emailed });
}
