import { NextResponse } from "next/server";
import {
  createDeliverable,
  updateDeliverable,
  deleteDeliverable,
  ensurePortalToken,
  DELIVERABLE_STATUS_LABELS,
  type DeliverableStatus,
} from "@/lib/portal";
import { uploadDeliverable } from "@/lib/storage";
import { getCase } from "@/lib/adminCases";
import { sendDeliverableNotice } from "@/lib/resend";
import { createAdminSupabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 由 middleware（/api/admin/:path*）保護，這裡不再重覆驗證。

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gathertaiwan.com";
const BUCKET = "deliverables";
/** 交付檔案大小上限 4MB——Vercel serverless body 上限 4.5MB，宣稱更大只會在平台層被砍
 *  （更大檔案改走 Supabase createSignedUploadUrl 瀏覽器直傳，列入 backlog）。 */
const MAX_FILE_BYTES = 4 * 1024 * 1024;

function isDeliverableStatus(v: unknown): v is DeliverableStatus {
  return typeof v === "string" && v in DELIVERABLE_STATUS_LABELS;
}

function truthy(v: unknown): boolean {
  return ["1", "true", "on", "yes"].includes(String(v ?? "").toLowerCase());
}

/** best-effort 移除 storage 檔案（失敗僅 log；孤兒檔不擋主流程）。 */
async function removeStorageFile(filePath: string): Promise<void> {
  const supabase = createAdminSupabase();
  if (!supabase || !filePath) return;
  try {
    const { error } = await supabase.storage.from(BUCKET).remove([filePath]);
    if (error) console.error("[admin/deliverables] storage remove failed:", error.message);
  } catch (err) {
    console.error("[admin/deliverables] storage remove failed:", err);
  }
}

// ── 上傳／發布交付物（multipart/form-data：file? content_md? title case_id milestone_id? is_final?）──
// 檔案或 markdown 內容擇一；成功即 status='delivered' 並寄客人「待驗收」通知（含 portal 連結）。
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_form" }, { status: 400 });
  }

  const caseId = String(form.get("case_id") ?? "").trim();
  const title = String(form.get("title") ?? "").trim();
  if (!caseId || !title) {
    return NextResponse.json(
      { ok: false, error: "missing_fields", message: "請填案件與交付物標題。" },
      { status: 422 }
    );
  }

  const fileEntry = form.get("file");
  const file = fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : null;
  const contentMd = String(form.get("content_md") ?? "");
  const hasContent = !!contentMd.trim();

  if (file && hasContent) {
    return NextResponse.json(
      { ok: false, error: "file_or_content", message: "檔案與文字內容擇一即可。" },
      { status: 422 }
    );
  }
  if (!file && !hasContent) {
    return NextResponse.json(
      { ok: false, error: "missing_content", message: "請上傳檔案或貼上文字內容。" },
      { status: 422 }
    );
  }
  if (file && file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { ok: false, error: "file_too_large", message: "檔案超過 4MB 上限（更大檔案請先提供雲端連結，直傳功能規劃中）。" },
      { status: 413 }
    );
  }

  const caseRow = await getCase(caseId);
  if (!caseRow) {
    return NextResponse.json({ ok: false, error: "case_not_found" }, { status: 404 });
  }

  // 檔案先落私有 bucket（deliverables），拿 file_path。
  let filePath: string | null = null;
  if (file) {
    const bytes = await file.arrayBuffer();
    filePath = await uploadDeliverable(file.name, bytes, file.type);
    if (!filePath) {
      return NextResponse.json({ ok: false, error: "upload_failed" }, { status: 503 });
    }
  }

  const milestoneIdRaw = String(form.get("milestone_id") ?? "").trim();
  const deliverable = await createDeliverable({
    case_id: caseId,
    milestone_id: milestoneIdRaw || null,
    title,
    file_path: filePath,
    content_md: hasContent ? contentMd : null,
    is_final: truthy(form.get("is_final")),
    status: "delivered",
  });
  if (!deliverable) {
    if (filePath) await removeStorageFile(filePath); // DB 沒寫成 → 收回剛上傳的檔案
    return NextResponse.json({ ok: false, error: "create_failed" }, { status: 503 });
  }

  // DB 已落地 → 通知客人（要有 Email 且 portal token 產得出來才寄；失敗僅 log）。
  let emailed = false;
  if (caseRow.contact_email) {
    try {
      const token = await ensurePortalToken(caseId);
      if (token) {
        emailed = await sendDeliverableNotice(caseRow, deliverable, `${SITE_URL}/portal/${token}`);
      }
    } catch (err) {
      console.error("[admin/deliverables] sendDeliverableNotice failed:", err);
    }
  }

  return NextResponse.json({ ok: true, deliverable, emailed }, { status: 201 });
}

// ── 更新交付物（title / is_final / status）──
export async function PATCH(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const id = body.id ? String(body.id) : null;
  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 422 });

  const patch: Parameters<typeof updateDeliverable>[1] = {};
  if (body.title !== undefined) {
    const t = String(body.title ?? "").trim();
    if (!t) {
      return NextResponse.json(
        { ok: false, error: "empty_title", message: "交付物標題不可為空。" },
        { status: 422 }
      );
    }
    patch.title = t;
  }
  if (body.is_final !== undefined) patch.is_final = !!body.is_final;
  if (body.status !== undefined) {
    if (!isDeliverableStatus(body.status)) {
      return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 422 });
    }
    patch.status = body.status; // →approved 時 lib 會補 approved_at
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "empty_patch" }, { status: 422 });
  }

  const deliverable = await updateDeliverable(id, patch);
  if (!deliverable) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, deliverable });
}

// ── 刪除交付物（連 storage 檔案一起刪）──
export async function DELETE(req: Request) {
  let id: string | null = null;
  try {
    const body = await req.json();
    id = body?.id ? String(body.id) : null;
  } catch {
    // 沒有 body → 改讀 query param
  }
  if (!id) id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 422 });

  // 先取 file_path（刪列後就查不到了）。
  let filePath: string | null = null;
  const supabase = createAdminSupabase();
  if (supabase) {
    try {
      const { data } = await supabase.from("deliverables").select("file_path").eq("id", id).maybeSingle();
      filePath = ((data as { file_path: string | null } | null)?.file_path) ?? null;
    } catch {
      /* 查不到就當沒檔案 */
    }
  }

  const ok = await deleteDeliverable(id);
  if (!ok) return NextResponse.json({ ok: false, error: "delete_failed" }, { status: 503 });

  if (filePath) await removeStorageFile(filePath);
  return NextResponse.json({ ok: true });
}
