import { NextResponse } from "next/server";
import { callGeminiChat, rateLimit, clientIp, aiErrorResponse, type ChatTurn } from "@/lib/gemini";
import { chatSystem } from "@/lib/aiConfig";
import { getRateCard, rateCardText } from "@/lib/pricing";
import { logChat } from "@/lib/adminChat";
import { hasQuoteKeyword, classifyQuoteReady, getQuoteIdBySession } from "@/lib/quote";

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
    // 價目表即時從 DB 注入（後台改價 → 聊天立即講新價，免部署）
    const reply = await callGeminiChat(turns, {
      system: chatSystem(rateCardText(await getRateCard())),
      maxTokens: 600,
    });
    // 記錄整段對話 + 萃取聯絡資訊（後台諮詢紀錄用）。
    // 這裡 await：serverless 對「回應後才跑的非同步工作」不保證跑完，
    // 而萃取/寫入是核心功能，必須確保完成；失敗吞掉、不影響回覆。
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.slice(0, 64) : "";
    try {
      await logChat(sessionId, turns, reply, clientIp(req), req.headers.get("user-agent"));
    } catch {
      /* 記錄/萃取失敗不影響回覆 */
    }

    // 偵測「客人已同意收報價」→ 回 quotePending，讓前端觸發報價草稿生成。
    // 只在對話出現報價關鍵字、且該 session 尚無報價時才跑（省成本）。
    let quotePending = false;
    try {
      const convo: ChatTurn[] = [...turns, { role: "model", text: reply }];
      const transcript = convo.map((t) => t.text).join("\n");
      if (sessionId && hasQuoteKeyword(transcript) && !(await getQuoteIdBySession(sessionId))) {
        const cls = await classifyQuoteReady(convo);
        if (cls?.ready && cls.email) quotePending = true;
      }
    } catch {
      /* 偵測失敗不影響回覆 */
    }

    return NextResponse.json({ ok: true, reply, quotePending });
  } catch (err) {
    const { status, body: b } = aiErrorResponse(err);
    return NextResponse.json(b, { status });
  }
}
