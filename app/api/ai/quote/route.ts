import { NextResponse } from "next/server";
import { rateLimit, clientIp, type ChatTurn } from "@/lib/gemini";
import { createAdminSupabase } from "@/lib/supabase";
import { generateQuoteDraft, insertQuote, getQuoteIdBySession, getQuote } from "@/lib/quote";
import { sendQuoteDraftNotice } from "@/lib/resend";

export const runtime = "nodejs";

/**
 * 由 ChatWidget 在「客人同意收報價」時呼叫：以 sessionId 撈對話 → Gemini 依價目表
 * 產生報價草稿 → 存 quotes(status draft) → 通知老闆待審。session 去重、有速率限制。
 */
export async function POST(req: Request) {
  let body: { sessionId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.slice(0, 64) : "";
  if (!sessionId) return NextResponse.json({ ok: false, error: "no_session" }, { status: 422 });

  // 去重：這段對話已經有報價 → 直接回
  const existing = await getQuoteIdBySession(sessionId);
  if (existing) return NextResponse.json({ ok: true, id: existing, existed: true });

  if (!(await rateLimit(clientIp(req)))) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const supabase = createAdminSupabase();
  if (!supabase) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });

  // 撈這段對話 + 已萃取的聯絡資訊
  const { data: log } = await supabase
    .from("ai_chat_logs")
    .select("messages, contact_name, contact_email, contact_phone, contact_line")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (!log || !Array.isArray(log.messages) || log.messages.length === 0) {
    return NextResponse.json({ ok: false, error: "no_conversation" }, { status: 404 });
  }
  const turns: ChatTurn[] = (log.messages as Array<{ role?: string; text?: string }>)
    .filter((m) => m && typeof m.text === "string" && m.text.trim())
    .map((m) => ({ role: m.role === "model" ? "model" : "user", text: String(m.text) }));

  const draft = await generateQuoteDraft(turns);
  if (!draft) return NextResponse.json({ ok: false, error: "generate_failed" }, { status: 502 });

  const notes =
    [draft.title ? `【${draft.title}】` : "", draft.notes].filter(Boolean).join("\n").trim() || null;

  const id = await insertQuote({
    session_id: sessionId,
    client_name: (log.contact_name as string) || null,
    contact_email: (log.contact_email as string) || null,
    contact_phone: (log.contact_phone as string) || null,
    contact_line: (log.contact_line as string) || null,
    line_items: draft.line_items,
    notes,
    created_by: "ai",
  });
  if (!id) return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });

  // 通知老闆有草稿待審（await 確保 serverless 上寄出；失敗不影響）
  try {
    const q = await getQuote(id);
    if (q) await sendQuoteDraftNotice(q);
  } catch {
    /* ignore */
  }

  return NextResponse.json({ ok: true, id });
}
