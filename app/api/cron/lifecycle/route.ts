import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase";
import {
  sendContractReminderEmail,
  sendPaymentReminderEmail,
  sendReviewReminderEmail,
  sendRevisitEmail,
} from "@/lib/resend";
import { getCase } from "@/lib/adminCases";
import { ensurePortalToken } from "@/lib/portal";
import type { Contract } from "@/lib/contract";
import type { Payment } from "@/lib/payment";

// 錢的閉環＋生命週期每日跟進 cron（Vercel Cron 以 GET 呼叫，帶 Authorization: Bearer <CRON_SECRET>）。
// 1) 合約寄出逾 N 天仍未簽、未提醒過 → 寄一次簽署提醒，成功才記 reminded_at。
// 2) 請款單建立逾 N 天仍未付、未提醒過 → 寄一次付款提醒，成功才記 reminded_at。
// 3) 最終交付逾 N 天仍未驗收、未提醒過 → 寄一次「請驗收」提醒給客人，成功才記 review_reminded_at。
// 4) 案件結案逾 M 天、未回訪過 → 寄一次回訪信給客人，成功才記 revisit_sent_at。
// N = env LIFECYCLE_FOLLOWUP_DAYS（預設 3）；M = env REVISIT_DAYS（預設 30）。
// 一律「只有真的寄出去才寫時間戳」——暫時性失敗（含缺 email）留待明天重試。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gathertaiwan.com";

// 只選 email 需要的欄位（與 lib SELECT 對齊，供 sendXxx 使用）。
const CONTRACT_SELECT =
  "id, contract_no, case_id, quote_id, client_name, contact_email, content_md, status, public_token, sent_at, signed_at, signer_name, signer_ip, signer_user_agent, reminded_at, created_at, updated_at";
const PAYMENT_SELECT =
  "id, payment_no, case_id, quote_id, contract_id, kind, title, amount, status, method, public_token, gateway_order_no, gateway_trade_no, atm_bank_code, atm_v_account, atm_expire_date, paid_at, reminded_at, created_at, updated_at";

export async function GET(req: NextRequest) {
  // ── 授權：必須帶 Bearer <CRON_SECRET>。未設 secret 或不符 → 401（fail-closed）。
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminSupabase();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });
  }

  let contractsReminded = 0;
  let paymentsReminded = 0;
  let reviewsReminded = 0;
  let revisitsSent = 0;

  try {
    const rawDays = Number(process.env.LIFECYCLE_FOLLOWUP_DAYS);
    const days = Number.isFinite(rawDays) && rawDays >= 0 ? rawDays : 3; // 允許 0（當天就提醒）
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();

    // ── 1) 未簽約提醒（單次；只有真的寄出去才記 reminded_at，暫時性失敗留待明天重試）──
    const { data: contractRows } = await supabase
      .from("contracts")
      .select(CONTRACT_SELECT)
      .eq("status", "sent")
      .is("reminded_at", null)
      .not("sent_at", "is", null)
      .lt("sent_at", cutoff)
      .limit(50);

    for (const c of (contractRows ?? []) as unknown as Contract[]) {
      const sent = await sendContractReminderEmail(c);
      if (sent) {
        await supabase
          .from("contracts")
          .update({ reminded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", c.id);
        contractsReminded += 1;
      }
    }

    // ── 2) 未付款提醒（單次）──
    const { data: paymentRows } = await supabase
      .from("payments")
      .select(PAYMENT_SELECT)
      .eq("status", "pending")
      .is("reminded_at", null)
      .lt("created_at", cutoff)
      .limit(50);

    for (const p of (paymentRows ?? []) as unknown as Payment[]) {
      const sent = await sendPaymentReminderEmail(p);
      if (sent) {
        await supabase
          .from("payments")
          .update({ reminded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", p.id);
        paymentsReminded += 1;
      }
    }

    // ── 3) 最終交付逾期未驗收提醒（單次）──
    // is_final 交付物已 delivered（待驗收）逾 N 天仍未驗收（未 approved 即 status 仍為 delivered）、
    // 未提醒過 → join 案件拿 email/portal，寄「請驗收」。case 無 email → 跳過不寫時間戳（留待補資料）。
    const { data: deliverableRows } = await supabase
      .from("deliverables")
      .select("id, case_id, is_final, status, review_reminded_at, created_at")
      .eq("status", "delivered")
      .eq("is_final", true)
      .is("review_reminded_at", null)
      .lt("created_at", cutoff)
      .limit(50);

    for (const d of (deliverableRows ?? []) as Array<{ id: string; case_id: string }>) {
      const caseRow = await getCase(d.case_id);
      if (!caseRow || !caseRow.contact_email) continue; // 無案件／無 email → 不寄、不寫時間戳
      const token = await ensurePortalToken(d.case_id);
      if (!token) continue; // 拿不到 portal 連結 → 留待重試
      const sent = await sendReviewReminderEmail(caseRow, `${SITE_URL}/portal/${token}`);
      if (sent) {
        await supabase
          .from("deliverables")
          .update({ review_reminded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", d.id);
        reviewsReminded += 1;
      }
    }

    // ── 4) 結案後回訪信（單次）──
    const revisitRawDays = Number(process.env.REVISIT_DAYS);
    const revisitDays = Number.isFinite(revisitRawDays) && revisitRawDays >= 0 ? revisitRawDays : 30;
    const revisitCutoff = new Date(Date.now() - revisitDays * 86400000).toISOString();

    const { data: closedCaseRows } = await supabase
      .from("client_cases")
      .select("id")
      .eq("status", "已結案")
      .not("closed_at", "is", null)
      .is("revisit_sent_at", null)
      .lt("closed_at", revisitCutoff)
      .not("contact_email", "is", null)
      .limit(50);

    for (const row of (closedCaseRows ?? []) as Array<{ id: string }>) {
      const caseRow = await getCase(row.id);
      if (!caseRow || !caseRow.contact_email) continue; // 無 email → 不寄、不寫時間戳
      const sent = await sendRevisitEmail(caseRow);
      if (sent) {
        await supabase
          .from("client_cases")
          .update({ revisit_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", row.id);
        revisitsSent += 1;
      }
    }

    return NextResponse.json({ ok: true, contractsReminded, paymentsReminded, reviewsReminded, revisitsSent });
  } catch (err) {
    console.error("[cron/lifecycle] failed:", err);
    return NextResponse.json(
      { ok: false, error: "cron_failed", contractsReminded, paymentsReminded, reviewsReminded, revisitsSent },
      { status: 500 }
    );
  }
}
