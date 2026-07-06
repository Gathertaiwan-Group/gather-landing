import { createAdminSupabase } from "@/lib/supabase";

const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// 每 IP 每日上限 + 全站每日上限（保護免費配額 / 防濫用）
const PER_IP_DAILY = 40;
const GLOBAL_DAILY = 2000;

export type GeminiOpts = {
  system?: string;
  maxTokens?: number;
  temperature?: number;
};

/** 取用戶端 IP（Vercel 會帶 x-forwarded-for）。 */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "0.0.0.0";
}

/** 速率限制：先檢查全站每日，再檢查該 IP 每日。回 true = 允許。 */
export async function rateLimit(ip: string): Promise<boolean> {
  const supabase = createAdminSupabase();
  if (!supabase) return true; // 未設定 DB 時不擋（開發用）
  try {
    const g = await supabase.rpc("ai_rate_check", { p_ip: "__global__", p_limit: GLOBAL_DAILY });
    if (g.error || g.data === false) return false;
    const u = await supabase.rpc("ai_rate_check", { p_ip: ip, p_limit: PER_IP_DAILY });
    if (u.error) return true; // RPC 出錯不因此擋掉正常用戶
    return u.data !== false;
  } catch {
    return true;
  }
}

export class RateLimitError extends Error {}
export class GeminiError extends Error {}

/** 呼叫 Gemini（關閉 thinking 以免吃掉輸出預算）。回傳純文字。 */
export async function callGemini(prompt: string, opts: GeminiOpts = {}): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiError("gemini_not_configured");

  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.7,
      maxOutputTokens: opts.maxTokens ?? 800,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
  if (opts.system) {
    body.systemInstruction = { parts: [{ text: opts.system }] };
  }

  const res = await fetch(`${ENDPOINT}?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (res.status === 429) throw new RateLimitError("quota");
  if (!res.ok) throw new GeminiError(`http_${res.status}`);

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
  if (!text) throw new GeminiError("empty");
  return text;
}

export type ChatTurn = { role: "user" | "model"; text: string };

/** 多輪對話版：turns 為 user/model 交錯的訊息。 */
export async function callGeminiChat(turns: ChatTurn[], opts: GeminiOpts = {}): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiError("gemini_not_configured");

  const body: Record<string, unknown> = {
    contents: turns.slice(-12).map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    generationConfig: {
      temperature: opts.temperature ?? 0.6,
      maxOutputTokens: opts.maxTokens ?? 600,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };

  const res = await fetch(`${ENDPOINT}?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 429) throw new RateLimitError("quota");
  if (!res.ok) throw new GeminiError(`http_${res.status}`);
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
  if (!text) throw new GeminiError("empty");
  return text;
}

/** 呼叫 Gemini 並要求回傳符合 schema 的 JSON（結構化萃取用）。任何錯誤回 null，不 throw。 */
export async function callGeminiJSON<T = unknown>(
  prompt: string,
  opts: { system?: string; schema: Record<string, unknown>; maxTokens?: number }
): Promise<T | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: opts.maxTokens ?? 400,
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: "application/json",
      responseSchema: opts.schema,
    },
  };
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };

  try {
    const res = await fetch(`${ENDPOINT}?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** 統一的 API route 錯誤回應（友善訊息 + 導 LINE）。 */
export function aiErrorResponse(err: unknown): { status: number; body: Record<string, unknown> } {
  const line = process.env.NEXT_PUBLIC_LINE_URL ?? "https://line.me/R/ti/p/@864nqqxj";
  if (err instanceof RateLimitError) {
    return {
      status: 429,
      body: { ok: false, error: "rate_limited", message: "今天的 AI 試用次數用得差不多了，歡迎直接透過 LINE 與我們聊聊。", line },
    };
  }
  return {
    status: 502,
    body: { ok: false, error: "ai_error", message: "AI 暫時忙線中，請稍後再試，或直接用 LINE 聯絡我們。", line },
  };
}
