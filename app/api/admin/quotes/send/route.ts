import { NextResponse } from "next/server";
import { getQuote, prepareQuoteForSend } from "@/lib/quote";
import { sendQuoteEmail } from "@/lib/resend";

export const runtime = "nodejs";

// 由 middleware（/api/admin/:path*）保護。

// ── 核准並寄出報價 ──
// 先確認有 Email 才 prepareForSend（產 token / 設 valid_until / status→sent），
// 再嘗試寄信。信件 env 未設時 quote 仍標記為已寄出，emailed=false 回報。
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const id = body.id ? String(body.id) : null;
  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 422 });

  // 先載入，確認存在且有 Email，再 prepareForSend（避免無 Email 就改狀態）。
  const existing = await getQuote(id);
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (!existing.contact_email) {
    return NextResponse.json(
      { ok: false, error: "no_email", message: "請先填客戶 Email 再寄出" },
      { status: 422 }
    );
  }

  const q = await prepareQuoteForSend(id);
  if (!q) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const emailed = await sendQuoteEmail(q);
  return NextResponse.json({ ok: true, emailed, token: q.public_token });
}
