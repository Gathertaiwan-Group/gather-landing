import { NextResponse } from "next/server";
import { callGeminiChat, rateLimit, clientIp, aiErrorResponse, type ChatTurn } from "@/lib/gemini";
import { CHAT_SYSTEM } from "@/lib/aiConfig";
import { logChat } from "@/lib/adminChat";

export const runtime = "nodejs";

type InMsg = { role?: string; text?: string };

export async function POST(req: Request) {
  let body: { messages?: InMsg[]; sessionId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const raw = Array.isArray(body.messages) ? body.messages : [];
  const turns: ChatTurn[] = raw
    .filter((m) => m && typeof m.text === "string" && m.text.trim())
    .map((m) => ({
      role: m.role === "model" || m.role === "assistant" ? "model" : "user",
      text: String(m.text).slice(0, 1000),
    }));

  if (turns.length === 0 || turns[turns.length - 1].role !== "user") {
    return NextResponse.json({ ok: false, error: "no_user_message" }, { status: 422 });
  }

  if (!(await rateLimit(clientIp(req)))) {
    const { status, body: b } = aiErrorResponse(new (await import("@/lib/gemini")).RateLimitError());
    return NextResponse.json(b, { status });
  }

  try {
    const reply = await callGeminiChat(turns, { system: CHAT_SYSTEM, maxTokens: 600 });
    // 記錄整段對話 + 萃取聯絡資訊（後台諮詢紀錄用）。
    // 這裡 await：serverless 對「回應後才跑的非同步工作」不保證跑完，
    // 而萃取/寫入是核心功能，必須確保完成；失敗吞掉、不影響回覆。
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.slice(0, 64) : "";
    try {
      await logChat(sessionId, turns, reply, clientIp(req), req.headers.get("user-agent"));
    } catch {
      /* 記錄/萃取失敗不影響回覆 */
    }
    return NextResponse.json({ ok: true, reply });
  } catch (err) {
    const { status, body: b } = aiErrorResponse(err);
    return NextResponse.json(b, { status });
  }
}
