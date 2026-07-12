import { createAdminSupabase } from "@/lib/supabase";

// 交付物檔案：私有 Supabase Storage bucket "deliverables"。
// 上傳走 service_role、下載一律簽名 URL（bucket 不公開）。

const BUCKET = "deliverables";

/**
 * 檔名淨化（路徑穿越防護）：先去掉任何路徑段（/ 與 \），再只留安全字元
 * [A-Za-z0-9._-]、折疊連續點、去掉開頭的 . _ -；保尾端 80 字（副檔名在尾端）。
 * 全部被濾掉（如純中文檔名）→ 退為 "file"，唯一性由呼叫端的隨機前綴保證。
 */
function safeFileName(fileName: string): string {
  const base = String(fileName ?? "").split(/[/\\]/).pop() ?? "";
  const cleaned = base
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^[._-]+/, "");
  const trimmed = cleaned.slice(-80);
  return trimmed || "file";
}

/**
 * 上傳交付物到私有 bucket，路徑 `case/<yyyymm>/<rand>-<safe fileName>`。
 * 成功回 file_path（存 deliverables.file_path），失敗回 null。
 */
export async function uploadDeliverable(
  fileName: string,
  bytes: ArrayBuffer | Buffer,
  contentType: string
): Promise<string | null> {
  const supabase = createAdminSupabase();
  if (!supabase) return null;
  if (!bytes || bytes.byteLength === 0) return null;

  const now = new Date();
  const yyyymm = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const rand = globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  const path = `case/${yyyymm}/${rand}-${safeFileName(fileName)}`;

  try {
    const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: contentType || "application/octet-stream",
      upsert: false,
    });
    if (error) {
      console.error("[storage] uploadDeliverable failed:", error.message);
      return null;
    }
    return path;
  } catch (err) {
    console.error("[storage] uploadDeliverable failed:", err);
    return null;
  }
}

/**
 * 產交付物下載用簽名 URL（預設效期 3600 秒）。
 * 路徑不存在／bucket 出錯 → 回 null 不 throw。
 */
export async function signedDeliverableUrl(filePath: string, expiresInSec?: number): Promise<string | null> {
  const supabase = createAdminSupabase();
  if (!supabase || !filePath) return null;
  const expires =
    expiresInSec !== undefined && Number.isFinite(expiresInSec) && expiresInSec > 0
      ? Math.floor(expiresInSec)
      : 3600;
  try {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(filePath, expires);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}
