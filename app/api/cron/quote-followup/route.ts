import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase";
import { sendQuoteReminderEmail } from "@/lib/resend";
import type { Quote } from "@/lib/quote";

// 每日跟進 cron（Vercel Cron 以 GET 呼叫，並帶 Authorization: Bearer <CRON_SECRET>）。
// 1) 對寄出後逾 N 天、未接受、未提醒過的報價寄一次跟進信，成功才記 reminded_at。
// 2) 把已逾有效期限、仍未接受的報價標為 expired。
export const runtime = "nodejs";

// cron 只選 email 需要的欄位即可（select * 最省事，這裡列出以節省流量）。
const CRON_SELECT =
  "id, quote_no, client_name, contact_email, public_token, total, line_items, status, accepted_at, reminded_at, sent_at, valid_until";

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

  let reminded = 0;
  let expired = 0;

  try {
    // ── 1) 跟進提醒（單次）──
    const days = Number(process.env.QUOTE_FOLLOWUP_DAYS) || 3;
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();

    const { data: rows } = await supabase
      .from("quotes")
      .select(CRON_SELECT)
      .in("status", ["sent", "viewed"])
      .is("accepted_at", null)
      .is("reminded_at", null)
      .not("sent_at", "is", null)
      .lt("sent_at", cutoff)
      .limit(50);

    const quotes = (rows ?? []) as unknown as Quote[];
    for (const q of quotes) {
      // 只有真的寄出去才記 reminded_at；暫時性寄信失敗留待明天重試。
      const sent = await sendQuoteReminderEmail(q);
      if (sent) {
        await supabase
          .from("quotes")
          .update({ reminded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", q.id);
        reminded += 1;
      }
    }

    // ── 2) 逾期：已過有效期限、仍未接受 → expired ──
    const nowIso = new Date().toISOString();
    const { data: expiredRows } = await supabase
      .from("quotes")
      .update({ status: "expired", updated_at: nowIso })
      .in("status", ["sent", "viewed"])
      .is("accepted_at", null)
      .not("valid_until", "is", null)
      .lt("valid_until", nowIso)
      .select("id");
    expired = expiredRows?.length ?? 0;

    return NextResponse.json({ ok: true, reminded, expired });
  } catch {
    return NextResponse.json({ ok: false, error: "cron_failed", reminded, expired }, { status: 500 });
  }
}
