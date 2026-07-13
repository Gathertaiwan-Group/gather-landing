import { NextResponse } from "next/server";
import { getCase } from "@/lib/adminCases";
import { getQuote, getQuoteIdBySession, type Quote } from "@/lib/quote";
import { getChatLogBySession } from "@/lib/adminChat";
import { listDeliverables, createDeliverable } from "@/lib/portal";
import { GENERATORS, aiDraftTitle, type GeneratorContext } from "@/lib/generators/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** 逐個 generator 呼叫 Gemini（最多 3 次），會超過 Vercel 預設 10s → 拉到 60s。 */
export const maxDuration = 60;

// 由 middleware（/api/admin/:path*）保護，這裡不再重覆驗證。

// ── 一鍵產生 AI 初稿（人審中心：只建 status='draft'，老闆編輯後才發布給客戶）──
// body: { id: <case id> }
// 冪等：同 case 已有「title 完全相同」的交付物（含已編輯發布者）→ 該 generator skip。
// 回 { ok, created, skipped, failed, results }；有跑但全失敗 → 502。
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const id = body.id ? String(body.id) : null;
  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 422 });

  const caseRow = await getCase(id);
  if (!caseRow) return NextResponse.json({ ok: false, error: "case_not_found" }, { status: 404 });

  // ── 蒐集素材：報價（case.quote_id，退回以 session 配對；與案件詳情頁同邏輯）＋售前對話 ──
  const quoteId = caseRow.quote_id ?? (caseRow.session_id ? await getQuoteIdBySession(caseRow.session_id) : null);
  const quote: Quote | null = quoteId ? await getQuote(quoteId) : null;

  let chatTranscript = "";
  if (caseRow.session_id) {
    const log = await getChatLogBySession(caseRow.session_id);
    if (log?.messages?.length) {
      chatTranscript = log.messages
        .map((m) => `${m.role === "user" ? "訪客" : "AI"}：${m.text}`)
        .join("\n");
    }
  }

  // ── 冪等基準：既有交付物 title 集合（含 draft；發布後 title 未改也一樣算已產過）──
  const existing = await listDeliverables(caseRow.id, { includeDraft: true });
  const existingTitles = new Set(existing.map((d) => d.title));

  const ctx: GeneratorContext = { caseRow, quote, chatTranscript };
  const applicable = GENERATORS.filter((g) => g.appliesTo(quote));

  let created = 0;
  let skipped = 0;
  let failed = 0;
  const results: Array<{ key: string; label: string; status: "created" | "skipped" | "failed" }> = [];

  // 逐個跑（序列化：對免費額度友善、錯誤好歸因；60s 內 3 次呼叫綽綽有餘）。
  for (const g of applicable) {
    const title = aiDraftTitle(g.label);
    if (existingTitles.has(title)) {
      skipped += 1;
      results.push({ key: g.key, label: g.label, status: "skipped" });
      continue;
    }
    let draft: Awaited<ReturnType<typeof g.generate>> = null;
    try {
      draft = await g.generate(ctx);
    } catch (err) {
      console.error(`[generate-drafts] generator ${g.key} threw:`, err);
    }
    if (!draft) {
      failed += 1;
      results.push({ key: g.key, label: g.label, status: "failed" });
      continue;
    }
    const row = await createDeliverable({
      case_id: caseRow.id,
      title: draft.title,
      content_md: draft.content_md,
      is_final: false,
      status: "draft",
    });
    if (!row) {
      failed += 1;
      results.push({ key: g.key, label: g.label, status: "failed" });
      continue;
    }
    existingTitles.add(title); // 防同批重複（理論上 GENERATORS 內 label 不重複，保險）
    created += 1;
    results.push({ key: g.key, label: g.label, status: "created" });
  }

  // 有實際嘗試產生（非全 skip）但全數失敗 → 502 讓前端顯示錯誤。
  if (failed > 0 && created === 0 && failed === applicable.length - skipped) {
    return NextResponse.json(
      { ok: false, error: "generate_failed", message: "AI 初稿產生失敗，請稍後再試。", created, skipped, failed, results },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, created, skipped, failed, results });
}
