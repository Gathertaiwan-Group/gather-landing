import { NextResponse } from "next/server";
import { callGeminiChat, rateLimit, clientIp, aiErrorResponse, type ChatTurn } from "@/lib/gemini";
import { CHAT_SYSTEM } from "@/lib/aiConfig";

export const runtime = "nodejs";

type InMsg = { role?: string; text?: string };

export async function POST(req: Request) {
  let body: { messages?: InMsg[] };
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
    return NextResponse.json({ ok: true, reply });
  } catch (err) {
    const { status, body: b } = aiErrorResponse(err);
    return NextResponse.json(b, { status });
  }
}
