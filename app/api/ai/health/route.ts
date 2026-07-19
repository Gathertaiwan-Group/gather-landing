import { NextResponse } from "next/server";
import { geminiHealthy } from "@/lib/gemini";

// 公開端點（不在 middleware）：聊天匡開啟時查一次 AI 是否正常。
// 只回一個布林值，不洩任何金鑰或內部資訊；健康結果在 lib 端快取 60 秒。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const ok = await geminiHealthy();
  return NextResponse.json({ ok }, { headers: { "Cache-Control": "no-store" } });
}
