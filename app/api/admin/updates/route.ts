import { NextResponse } from "next/server";
import { addUpdate, ensurePortalToken } from "@/lib/portal";
import { getCase } from "@/lib/adminCases";
import { sendOwnerReplyNotice } from "@/lib/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 由 middleware（/api/admin/:path*）保護，這裡不再重覆驗證。

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gathertaiwan.com";
const BODY_MAX = 2000;

// ── 老闆回覆專案動態：寫 case_updates(author='owner') → 寄信通知客人（含 portal 連結）──
// 先寫 DB 再寄信；寄信失敗僅 log，不影響回覆結果。客人沒 Email → 只寫 DB。
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const caseId = body.case_id ? String(body.case_id) : null;
  const text = String(body.body ?? "").trim();
  if (!caseId || !text) {
    return NextResponse.json(
      { ok: false, error: "missing_fields", message: "請填回覆內容。" },
      { status: 422 }
    );
  }
  if (text.length > BODY_MAX) {
    return NextResponse.json(
      { ok: false, error: "body_too_long", message: `回覆內容最長 ${BODY_MAX} 字。` },
      { status: 422 }
    );
  }

  const caseRow = await getCase(caseId);
  if (!caseRow) {
    return NextResponse.json({ ok: false, error: "case_not_found" }, { status: 404 });
  }

  const update = await addUpdate(caseId, "owner", text);
  if (!update) {
    return NextResponse.json({ ok: false, error: "insert_failed" }, { status: 503 });
  }

  // DB 已落地 → 通知客人（要有 Email 且 portal token 產得出來才寄）。
  let emailed = false;
  if (caseRow.contact_email) {
    try {
      const token = await ensurePortalToken(caseId);
      if (token) {
        emailed = await sendOwnerReplyNotice(caseRow, text, `${SITE_URL}/portal/${token}`);
      }
    } catch (err) {
      console.error("[admin/updates] sendOwnerReplyNotice failed:", err);
    }
  }

  return NextResponse.json({ ok: true, update, emailed }, { status: 201 });
}
