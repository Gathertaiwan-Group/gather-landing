import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { reviewDeliverableByPortal } from "@/lib/portal";

// 公開端點：客人在 /portal/<token> 對交付物「驗收通過／要求修改」。
// 歸屬驗證、僅 delivered 可審、冪等（重複 approve 不重觸發完工）都在
// lib/portal.reviewDeliverableByPortal 內；這裡只做輸入驗證與轉譯。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 修改意見長度上限（與 lib/portal 的動態上限一致）。 */
const FEEDBACK_MAX = 2000;

type ReviewBody = { token?: string; id?: string; action?: string; feedback?: string };

export async function POST(req: Request) {
  noStore(); // 繞過 fetch data cache：驗收判斷必須讀最新交付物狀態（冪等最後仍靠 DB 條件式 update）
  let payload: ReviewBody;
  try {
    payload = (await req.json()) as ReviewBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const token = String(payload.token ?? "").trim();
  const id = String(payload.id ?? "").trim();
  const action = payload.action;
  if (!token || !id || (action !== "approve" && action !== "reject")) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  const feedback = String(payload.feedback ?? "").trim();
  if (action === "reject" && !feedback) {
    // 要求修改必須附意見（前端 textarea 也擋，這裡是最後防線）。
    return NextResponse.json({ ok: false, error: "feedback_required" }, { status: 400 });
  }
  if (feedback.length > FEEDBACK_MAX) {
    return NextResponse.json({ ok: false, error: "feedback_too_long" }, { status: 400 });
  }

  const result = await reviewDeliverableByPortal(token, id, action, feedback || undefined);
  if (!result) {
    // token 無效／交付物不屬於此案件／非待驗收狀態——公開端點統一回 404，不洩細節。
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    finalTriggered: result.finalTriggered,
    status: result.deliverable.status,
  });
}
