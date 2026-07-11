import { createAdminSupabase } from "@/lib/supabase";

/** 案件狀態（app 端 allowlist；DB 存 text）。 */
export const CASE_STATUSES = ["洽談中", "報價中", "進行中", "已完成", "已結案", "擱置"] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

/** 案件來源。 */
export const CASE_SOURCES = ["line", "ai_chat", "referral", "manual"] as const;
export type CaseSource = (typeof CASE_SOURCES)[number];

export const SOURCE_LABELS: Record<string, string> = {
  line: "LINE",
  ai_chat: "AI 客服",
  referral: "轉介紹",
  manual: "手動新增",
};

/** 各狀態的 chip 顏色（前景/底色）。 */
export const STATUS_COLORS: Record<string, { fg: string; bg: string }> = {
  洽談中: { fg: "#8a6d00", bg: "#fff4d1" },
  報價中: { fg: "#b45309", bg: "#fdecdb" },
  進行中: { fg: "#0f56a6", bg: "#e2effb" },
  已完成: { fg: "#1f7a44", bg: "#dcf3e5" },
  已結案: { fg: "#3f7a52", bg: "#e8f2ea" },
  擱置: { fg: "#6e6e73", bg: "#ececee" },
};

export type ClientCase = {
  id: string;
  title: string;
  client_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  contact_line: string | null;
  source: string;
  status: string;
  budget: number | null;
  currency: string | null;
  notes: string | null;
  session_id: string | null;
  // ── 錢的閉環擴欄（quote → contract → payments 金流鏈）──
  quote_id: string | null;
  contract_id: string | null;
  deposit_paid_at: string | null;
  final_paid_at: string | null;
  closed_at: string | null;
  auto_opened: boolean;
  created_at: string;
  updated_at: string;
};

const SELECT_COLS =
  "id, title, client_name, contact_email, contact_phone, contact_line, source, status, budget, currency, notes, session_id, quote_id, contract_id, deposit_paid_at, final_paid_at, closed_at, auto_opened, created_at, updated_at";

/** 所有案件（後台用，service_role），依 updated_at 新到舊。出錯回 []。 */
export async function getCases(): Promise<ClientCase[]> {
  const supabase = createAdminSupabase();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("client_cases")
      .select(SELECT_COLS)
      .order("updated_at", { ascending: false });
    if (error || !data) return [];
    return data as ClientCase[];
  } catch {
    return [];
  }
}

/** 單一案件；找不到回 null。 */
export async function getCase(id: string): Promise<ClientCase | null> {
  const supabase = createAdminSupabase();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("client_cases")
      .select(SELECT_COLS)
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    return data as ClientCase;
  } catch {
    return null;
  }
}
