import { NextResponse } from "next/server";
import { acceptQuoteByToken } from "@/lib/quote";
import { sendQuoteAcceptedNotice } from "@/lib/resend";

// 公開端點：客人在 /quote/<token> 頁按「接受報價」時呼叫。
// middleware 只閘 /admin 與 /api/admin，這裡本來就公開。
export const runtime = "nodejs";

type AcceptBody = { token?: string };

export async function POST(req: Request) {
  let body: AcceptBody;
  try {
    body = (await req.json()) as AcceptBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const token = (body.token ?? "").trim();
  if (!token) {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  // 未接受且未過期 → 設 accepted 並回 Quote；已接受回原 Quote；過期／找不到回 null。
  const quote = await acceptQuoteByToken(token);
  if (!quote) {
    // 過期或不存在：報價已無法接受。
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 410 });
  }

  // 通知老闆有人接受了報價（env 未設 / 失敗都不阻塞回應）。
  void sendQuoteAcceptedNotice(quote).catch(() => {});

  return NextResponse.json({ ok: true });
}
