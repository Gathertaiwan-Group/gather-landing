import { NextResponse } from "next/server";
import { callGemini, rateLimit, clientIp, aiErrorResponse, RateLimitError } from "@/lib/gemini";
import { TOOL_SYSTEM } from "@/lib/aiConfig";
import { createAdminSupabase } from "@/lib/supabase";
import { getPublishedPosts } from "@/lib/blog";
import { logTool } from "@/lib/adminTool";

export const runtime = "nodejs";

const SAMPLE_CUSTOMERS = `姓名,最近購買,累計消費,購買次數,近90天互動
王小明,3天前,48000,12,高
陳美玲,95天前,120000,8,低
林大衛,10天前,6500,2,中
張雅婷,210天前,32000,5,無
李建宏,1天前,3200,1,高
黃淑芬,150天前,88000,15,低`;

function buildPrompt(tool: string, input: string, extra?: string): string {
  switch (tool) {
    case "copy":
      return `請為以下產業／產品各寫 3 種行銷文案，並用 Markdown 標題分組：**FB 貼文**（40-60字，一則）、**廣告標語**（3 個短句）、**EDM 主旨**（3 個）。語氣吸睛、符合台灣市場。\n\n產業／產品：${input}`;
    case "automation":
      return `使用者描述了一段重複性人工作業。請產出「自動化藍圖」，用 Markdown 呈現：\n1. **觸發時機**\n2. **自動化步驟**（逐步）\n3. **會用到的技術/工具**\n4. **預估省下的時間與效益**\n最後一句說明給樂能如何幫他把這套自動化落地。\n\n人工作業：${input}`;
    case "segment":
      return `以下是一份「範例」客戶資料（CSV）。請用 Markdown 表格做客戶分群（例如 VIP／忠實／新客／沉睡／流失風險），標出每群的**流失風險**（高/中/低）與**建議行動**。結尾一句點出：真實的 AI CRM 會即時、自動地做這件事。\n\n${extra || SAMPLE_CUSTOMERS}`;
    case "insight":
      return `以下是「給樂數位官網」的真實聚合數據。請用 Markdown 產出 3-4 點老闆看得懂的洞察 + 對應的可行動建議（口吻像顧問，不要只複述數字）。\n\n${extra}`;
    case "recommend":
      return `使用者的需求：「${input}」。\n請從下面的文章清單中，挑出最相關的 3 篇，用 Markdown 條列：每篇寫「**《標題》**」+ 一句推薦理由。只能從清單挑，不可捏造。\n\n文章清單：\n${extra}`;
    default:
      return input;
  }
}

export async function POST(req: Request) {
  let body: { tool?: string; input?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const tool = String(body.tool ?? "");
  const input = String(body.input ?? "").slice(0, 800).trim();
  if (!TOOL_SYSTEM[tool]) {
    return NextResponse.json({ ok: false, error: "unknown_tool" }, { status: 400 });
  }
  if (["copy", "automation", "recommend"].includes(tool) && !input) {
    return NextResponse.json({ ok: false, error: "missing_input", message: "請先輸入內容再送出。" }, { status: 422 });
  }

  if (!(await rateLimit(clientIp(req)))) {
    const { status, body: b } = aiErrorResponse(new RateLimitError());
    return NextResponse.json(b, { status });
  }

  try {
    // 需要 server 端資料的工具：insight（本站統計）、recommend（文章清單）
    let extra: string | undefined;
    if (tool === "insight") {
      const supabase = createAdminSupabase();
      let stats = "部落格文章：30 篇；分類：數位行銷 15、AI 賦能 15";
      if (supabase) {
        const [{ count: posts }, { count: contacts }, cats] = await Promise.all([
          supabase.from("blog_posts").select("*", { count: "exact", head: true }).eq("published", true),
          supabase.from("contact_submissions").select("*", { count: "exact", head: true }),
          supabase.from("blog_posts").select("category").eq("published", true),
        ]);
        const byCat: Record<string, number> = {};
        (cats.data ?? []).forEach((r) => {
          const c = (r.category as string) || "未分類";
          byCat[c] = (byCat[c] ?? 0) + 1;
        });
        stats = `已發佈部落格文章：${posts ?? 0} 篇\n分類分佈：${Object.entries(byCat).map(([k, v]) => `${k} ${v} 篇`).join("、")}\n聯絡表單累計提交：${contacts ?? 0} 筆\n服務項目：7 項；作品案例：6 個`;
      }
      extra = stats;
    } else if (tool === "recommend") {
      const posts = await getPublishedPosts();
      extra = posts.map((p) => `- 《${p.title}》（${p.category ?? ""}）：${p.excerpt ?? ""}`).join("\n");
    } else if (tool === "segment" && input) {
      extra = input;
    }

    const result = await callGemini(buildPrompt(tool, input, extra), {
      system: TOOL_SYSTEM[tool],
      maxTokens: 900,
      temperature: 0.7,
    });
    // 非阻塞記錄工具試用（後台潛客訊號用）。
    void logTool(tool, input, clientIp(req)).catch(() => {});
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const { status, body: b } = aiErrorResponse(err);
    return NextResponse.json(b, { status });
  }
}
