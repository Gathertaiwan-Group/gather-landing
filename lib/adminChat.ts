import { createAdminSupabase } from "@/lib/supabase";
import type { ChatTurn } from "@/lib/gemini";

export type ChatMsg = { role: "user" | "model"; text: string };

export type ChatLog = {
  id: string;
  session_id: string;
  messages: ChatMsg[];
  message_count: number;
  first_question: string | null;
  last_reply: string | null;
  user_ip: string | null;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
};

const SELECT_COLS =
  "id, session_id, messages, message_count, first_question, last_reply, user_ip, user_agent, created_at, updated_at";

/**
 * 記錄一段 AI 客服對話（以 session_id upsert，一段對話一列）。
 * 由 /api/ai/chat 以「非阻塞、吞錯」方式呼叫——記錄失敗絕不影響使用者回覆。
 */
export async function logChat(
  sessionId: string,
  turns: ChatTurn[],
  reply: string,
  ip: string,
  ua: string | null
): Promise<void> {
  if (!sessionId) return;
  const supabase = createAdminSupabase();
  if (!supabase) return;

  const messages: ChatMsg[] = [
    ...turns.map((t) => ({ role: t.role, text: t.text })),
    { role: "model" as const, text: reply },
  ];
  const firstQuestion = turns.find((t) => t.role === "user")?.text?.slice(0, 200) ?? null;

  try {
    await supabase.from("ai_chat_logs").upsert(
      {
        session_id: sessionId,
        messages,
        message_count: messages.length,
        first_question: firstQuestion,
        last_reply: reply.slice(0, 500),
        user_ip: ip,
        user_agent: (ua ?? "").slice(0, 300) || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "session_id" }
    );
  } catch {
    /* 靜默：記錄不能拖垮客服回覆 */
  }
}

/** 對話清單（後台用，service_role 讀）。出錯回 []。 */
export async function getChatLogs(limit = 100): Promise<ChatLog[]> {
  const supabase = createAdminSupabase();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("ai_chat_logs")
      .select(SELECT_COLS)
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data as ChatLog[];
  } catch {
    return [];
  }
}

/** 單段對話；找不到回 null。 */
export async function getChatLog(id: string): Promise<ChatLog | null> {
  const supabase = createAdminSupabase();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("ai_chat_logs")
      .select(SELECT_COLS)
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    return data as ChatLog;
  } catch {
    return null;
  }
}
