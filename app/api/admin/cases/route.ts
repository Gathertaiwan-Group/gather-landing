import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase";
import { CASE_STATUSES, CASE_SOURCES } from "@/lib/adminCases";

export const runtime = "nodejs";

// 由 middleware（/api/admin/:path*）保護，這裡不再重覆驗證。

const STATUS_SET = new Set<string>(CASE_STATUSES as readonly string[]);
const SOURCE_SET = new Set<string>(CASE_SOURCES as readonly string[]);

const NULLABLE = ["contact_email", "contact_phone", "contact_line", "notes", "session_id"];

function normalizeBudget(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

// ── 建立案件 ──
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const title = String(body.title ?? "").trim();
  const client_name = String(body.client_name ?? "").trim();
  if (!title || !client_name) {
    return NextResponse.json(
      { ok: false, error: "missing_fields", message: "案件名稱與客戶名稱為必填。" },
      { status: 422 }
    );
  }

  const status = body.status ? String(body.status) : "洽談中";
  const source = body.source ? String(body.source) : "manual";
  if (!STATUS_SET.has(status)) return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 422 });
  if (!SOURCE_SET.has(source)) return NextResponse.json({ ok: false, error: "invalid_source" }, { status: 422 });

  const supabase = createAdminSupabase();
  if (!supabase) return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });

  const row = {
    title,
    client_name,
    contact_email: body.contact_email ? String(body.contact_email) : null,
    contact_phone: body.contact_phone ? String(body.contact_phone) : null,
    contact_line: body.contact_line ? String(body.contact_line) : null,
    source,
    status,
    budget: normalizeBudget(body.budget),
    currency: body.currency ? String(body.currency) : "TWD",
    notes: body.notes ? String(body.notes) : null,
    session_id: body.session_id ? String(body.session_id) : null,
  };

  const { data, error } = await supabase.from("client_cases").insert(row).select("id").single();
  if (error || !data) {
    return NextResponse.json({ ok: false, error: "db_error", detail: error?.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
}

// ── 更新案件（含行內改狀態）──
export async function PATCH(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const id = body.id ? String(body.id) : null;
  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 422 });

  const patch: Record<string, unknown> = {};
  for (const k of [
    "title",
    "client_name",
    "contact_email",
    "contact_phone",
    "contact_line",
    "source",
    "status",
    "budget",
    "currency",
    "notes",
    "session_id",
  ]) {
    if (body[k] !== undefined) patch[k] = body[k];
  }

  if (patch.status !== undefined && !STATUS_SET.has(String(patch.status))) {
    return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 422 });
  }
  if (patch.source !== undefined && !SOURCE_SET.has(String(patch.source))) {
    return NextResponse.json({ ok: false, error: "invalid_source" }, { status: 422 });
  }
  if (patch.budget !== undefined) patch.budget = normalizeBudget(patch.budget);
  for (const k of NULLABLE) if (patch[k] === "") patch[k] = null;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "nothing_to_update" }, { status: 422 });
  }
  patch.updated_at = new Date().toISOString();

  const supabase = createAdminSupabase();
  if (!supabase) return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });

  const { data, error } = await supabase
    .from("client_cases")
    .update(patch)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: "db_error", detail: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, id: data.id });
}

// ── 刪除案件 ──
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

  const supabase = createAdminSupabase();
  if (!supabase) return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });

  const { error } = await supabase.from("client_cases").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: "db_error", detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
