import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server 端唯讀 client（用 anon key 讀公開資料，例如作品集）。
 * 未設定環境變數時回傳 null，呼叫端應有 fallback。
 */
export function createServerSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    auth: { persistSession: false },
  });
}

/**
 * Server 端寫入 client（用 service_role key，僅限 API route / server action）。
 * 繞過 RLS，務必只在 server 端使用，切勿暴露給瀏覽器。
 */
export function createAdminSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}
