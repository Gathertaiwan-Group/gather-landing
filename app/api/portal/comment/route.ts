import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { clientIp } from "@/lib/gemini";
import { createAdminSupabase } from "@/lib/supabase";
import { getCaseByPortalToken, addUpdate } from "@/lib/portal";
import { sendPortalCommentNotice } from "@/lib/resend";

// 公開端點：客人在 /portal/<token> 留言。
// middleware 只閘 /admin 與 /api/admin，這裡本來就公開；不洩內部錯誤細節。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 留言長度上限（與 lib/portal addUpdate 的上限一致）。 */
const BODY_MAX = 2000;

/** portal 留言專屬限流：每 IP 每日 30 則，與 AI 客服的全站/每 IP 額度完全脫鉤。 */
const COMMENT_PER_IP_DAILY = 30;
async function commentRateCheck(ip: string): Promise<boolean> {
  const supabase = createAdminSupabase();
  if (!supabase) return true; // 未設定 DB 時不擋（開發用）
  try {
    const { data, error } = await supabase.rpc("ai_rate_check", {
      p_ip: `portal-comment:${ip}`,
      p_limit: COMMENT_PER_IP_DAILY,
    });
    if (error) return true; // RPC 出錯不因此擋掉正常用戶
    return data !== false;
  } catch {
    return true;
  }
}

type CommentBody = { token?: string; body?: string };

export async function POST(req: Request) {
  noStore(); // 繞過 fetch data cache：token 查案件必須讀最新（同 portal 頁的 Next 14.2 陷阱）
  let payload: CommentBody;
  try {
    payload = (await req.json()) as CommentBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const token = String(payload.token ?? "").trim();
  const text = String(payload.body ?? "").trim();
  if (!token || !text) {
    return NextResponse.json({ ok: false, error: "body_required" }, { status: 400 });
  }
  if (text.length > BODY_MAX) {
    return NextResponse.json({ ok: false, error: "too_long" }, { status: 400 });
  }

  // 先驗 token 再扣額度：垃圾 token 進不了限流統計，也碰不到 AI 客服的共用額度。
  const caseRow = await getCaseByPortalToken(token);
  if (!caseRow) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  // 防灌水：portal 留言專屬 bucket（每 IP 每日 30 則）。
  const allowed = await commentRateCheck(clientIp(req));
  if (!allowed) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  // 先寫 DB；寫入失敗直接回錯（不寄信）。
  const update = await addUpdate(caseRow.id, "client", text);
  if (!update) {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }

  // DB 已落地 → 通知老闆；寄信失敗僅 log，不影響留言成功回應。
  try {
    await sendPortalCommentNotice(caseRow, update.body);
  } catch (err) {
    console.error("[portal/comment] 留言通知寄送失敗:", err);
  }

  return NextResponse.json({ ok: true });
}
