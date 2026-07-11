import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase";
import { sendContractReminderEmail, sendPaymentReminderEmail } from "@/lib/resend";
import type { Contract } from "@/lib/contract";
import type { Payment } from "@/lib/payment";

// 錢的閉環每日跟進 cron（Vercel Cron 以 GET 呼叫，帶 Authorization: Bearer <CRON_SECRET>）。
// 1) 合約寄出逾 N 天仍未簽、未提醒過 → 寄一次簽署提醒，成功才記 reminded_at。
// 2) 請款單建立逾 N 天仍未付、未提醒過 → 寄一次付款提醒，成功才記 reminded_at。
// N = env LIFECYCLE_FOLLOWUP_DAYS（預設 3）。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    return NextResponse.json({ ok: true, contractsReminded, paymentsReminded });
  } catch (err) {
    console.error("[cron/lifecycle] failed:", err);
    return NextResponse.json(
      { ok: false, error: "cron_failed", contractsReminded, paymentsReminded },
      { status: 500 }
    );
  }
}
