import { createAdminSupabase } from "@/lib/supabase";
import type { ChatTurn } from "@/lib/gemini";
import { extractLead, hasContactSignal } from "@/lib/leadExtract";
import { sendInquiryNotification } from "@/lib/resend";

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
  // AI 從對話中萃取的聯絡資訊與需求
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  contact_line: string | null;
  summary: string | null;
  intent: string | null;
  has_contact: boolean;
  created_at: string;
  updated_at: string;
};

const SELECT_COLS =
  "id, session_id, messages, message_count, first_question, last_reply, user_ip, user_agent, contact_name, contact_phone, contact_email, contact_line, summary, intent, has_contact, created_at, updated_at";

/**
 * 記錄一段 AI 客服對話（以 session_id upsert，一段對話一列），
 * 並在偵測到「聯絡訊號」時用 Gemini 萃取聯絡資訊/需求，只增不覆蓋地寫回。
 * 全程吞錯——記錄/萃取失敗絕不影響使用者回覆。
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

  // 只在最新一則使用者訊息含聯絡訊號時才做（較貴的）萃取——一般問答回合不觸發。
  try {
    const latestUser = turns[turns.length - 1]?.text ?? "";
    if (hasContactSignal(latestUser)) {
      const lead = await extractLead(turns);
      if (lead) {
        const patch: Record<string, string> = {};
        if (lead.contact_name) patch.contact_name = lead.contact_name;
        if (lead.contact_phone) patch.contact_phone = lead.contact_phone;
        if (lead.contact_email) patch.contact_email = lead.contact_email;
        if (lead.contact_line) patch.contact_line = lead.contact_line;
        if (lead.summary) patch.summary = lead.summary;
        if (lead.intent) patch.intent = lead.intent;
        // 只更新有值欄位 → 萃取到 null 不會覆蓋先前已抓到的聯絡資訊
        if (Object.keys(patch).length > 0) {
          await supabase.from("ai_chat_logs").update(patch).eq("session_id", sessionId);

          const hasContact = !!(
            lead.contact_name || lead.contact_phone || lead.contact_email || lead.contact_line
          );
          if (hasContact) {
            // 第一次抓到聯絡才寄一次通知：以 notified 旗標原子 claim，避免同段對話重複寄。
            const { data: claim } = await supabase
              .from("ai_chat_logs")
              .update({ notified: true })
              .eq("session_id", sessionId)
              .eq("notified", false)
              .select("id")
              .maybeSingle();
            if (claim) {
              await sendInquiryNotification({
                name: lead.contact_name || "AI 客服訪客",
                email: lead.contact_email,
                phone: lead.contact_phone,
                line: lead.contact_line,
                summary: lead.summary,
                source: "ai_chat",
              });
            }
          }
        }
      }
    }
  } catch {
    /* 萃取失敗不影響記錄本身 */
  }
}

/** 對話清單（後台用，service_role 讀）。有留聯絡者置頂。出錯回 []。 */
export async function getChatLogs(limit = 100): Promise<ChatLog[]> {
  const supabase = createAdminSupabase();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("ai_chat_logs")
      .select(SELECT_COLS)
      .order("has_contact", { ascending: false })
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

/** 有留下聯絡資訊的對話數（總覽計數卡）。 */
export async function getContactCount(): Promise<number> {
  const supabase = createAdminSupabase();
  if (!supabase) return 0;
  try {
    const { count, error } = await supabase
      .from("ai_chat_logs")
      .select("*", { count: "exact", head: true })
      .eq("has_contact", true);
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}
