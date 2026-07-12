import { NextResponse } from "next/server";
import {
  createMilestone,
  updateMilestone,
  deleteMilestone,
  MILESTONE_STATUS_LABELS,
  type MilestoneStatus,
} from "@/lib/portal";
import { getCase } from "@/lib/adminCases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 由 middleware（/api/admin/:path*）保護，這裡不再重覆驗證。

function isMilestoneStatus(v: unknown): v is MilestoneStatus {
  return typeof v === "string" && v in MILESTONE_STATUS_LABELS;
}

// ── 新增里程碑 ──
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const caseId = body.case_id ? String(body.case_id) : null;
  const title = String(body.title ?? "").trim();
  if (!caseId || !title) {
    return NextResponse.json(
      { ok: false, error: "missing_fields", message: "請填案件與里程碑標題。" },
      { status: 422 }
    );
  }

  const caseRow = await getCase(caseId);
  if (!caseRow) {
    return NextResponse.json({ ok: false, error: "case_not_found" }, { status: 404 });
  }

  const milestone = await createMilestone({
    case_id: caseId,
    title,
    description: body.description ? String(body.description) : undefined,
    due_date: body.due_date ? String(body.due_date) : null,
    sort_order: body.sort_order !== undefined ? Number(body.sort_order) : undefined,
  });
  if (!milestone) {
    return NextResponse.json({ ok: false, error: "create_failed" }, { status: 503 });
  }
  return NextResponse.json({ ok: true, milestone }, { status: 201 });
}

// ── 更新里程碑（改標題／狀態／到期日／排序）──
export async function PATCH(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const id = body.id ? String(body.id) : null;
  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 422 });

  const patch: Parameters<typeof updateMilestone>[1] = {};
  if (body.title !== undefined) {
    const t = String(body.title ?? "").trim();
    if (!t) {
      return NextResponse.json(
        { ok: false, error: "empty_title", message: "里程碑標題不可為空。" },
        { status: 422 }
      );
    }
    patch.title = t;
  }
  if (body.description !== undefined) patch.description = body.description == null ? null : String(body.description);
  if (body.due_date !== undefined) patch.due_date = body.due_date ? String(body.due_date) : null;
  if (body.sort_order !== undefined) patch.sort_order = Number(body.sort_order) || 0;
  if (body.status !== undefined) {
    if (!isMilestoneStatus(body.status)) {
      return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 422 });
    }
    patch.status = body.status; // →done 時 lib 會補 done_at ＋ 寫 system 動態
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "empty_patch" }, { status: 422 });
  }

  const milestone = await updateMilestone(id, patch);
  if (!milestone) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, milestone });
}

// ── 刪除里程碑 ──
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

  const ok = await deleteMilestone(id);
  if (!ok) return NextResponse.json({ ok: false, error: "delete_failed" }, { status: 503 });
  return NextResponse.json({ ok: true });
}
