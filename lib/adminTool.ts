import { createAdminSupabase } from "@/lib/supabase";

export type ToolLog = {
  id: string;
  tool: string;
  input: string | null;
  user_ip: string | null;
  created_at: string;
};

/** 記錄一次 AI 實驗室工具試用（非阻塞、吞錯）。 */
export async function logTool(tool: string, input: string, ip: string): Promise<void> {
  const supabase = createAdminSupabase();
  if (!supabase) return;
  try {
    await supabase.from("ai_tool_logs").insert({
      tool,
      input: input ? input.slice(0, 800) : null,
      user_ip: ip,
    });
  } catch {
    /* 靜默 */
  }
}

/** 工具試用清單（後台用）。出錯回 []。 */
export async function getToolLogs(limit = 100): Promise<ToolLog[]> {
  const supabase = createAdminSupabase();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("ai_tool_logs")
      .select("id, tool, input, user_ip, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data as ToolLog[];
  } catch {
    return [];
  }
}

/** 過去 N 天工具試用次數（總覽計數卡）。 */
export async function getToolCountSince(days = 7): Promise<number> {
  const supabase = createAdminSupabase();
  if (!supabase) return 0;
  try {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { count, error } = await supabase
      .from("ai_tool_logs")
      .select("*", { count: "exact", head: true })
      .gte("created_at", since);
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}
