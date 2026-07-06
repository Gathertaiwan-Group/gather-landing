import { createAdminSupabase } from "@/lib/supabase";

export type ContactSubmission = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  message: string;
  source: string;
  notified: boolean;
  created_at: string;
};

const COLS = "id, name, email, phone, message, source, notified, created_at";

/** 網站聯絡表單提交（後台用，service_role 讀）。出錯回 []。 */
export async function getContactSubmissions(limit = 100): Promise<ContactSubmission[]> {
  const supabase = createAdminSupabase();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("contact_submissions")
      .select(COLS)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data as ContactSubmission[];
  } catch {
    return [];
  }
}

/** 聯絡表單總數（總覽計數卡）。 */
export async function getContactSubmissionCount(): Promise<number> {
  const supabase = createAdminSupabase();
  if (!supabase) return 0;
  try {
    const { count, error } = await supabase
      .from("contact_submissions")
      .select("*", { count: "exact", head: true });
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}
