import { createAdminSupabase } from "@/lib/supabase";
import { randomToken } from "@/lib/quote";
import type { ClientCase } from "@/lib/adminCases";
import { completeCaseAndRequestFinal } from "@/lib/lifecycle";
import { sendOwnerEventNotice } from "@/lib/resend";

// P1 客戶專案入口：里程碑（milestones）／動態（case_updates）／交付物（deliverables）
// ＋ client_cases.portal_token（/portal/<token> 公開頁）。
// 全部走 service_role（RLS 鎖死），公開端點僅能經由 token → case 取資料。

// ── 里程碑 ──

export type MilestoneStatus = "pending" | "in_progress" | "done";

export type Milestone = {
  id: string;
  case_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: MilestoneStatus;
  sort_order: number;
  done_at: string | null;
  created_at: string;
  updated_at: string;
};

export const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  pending: "未開始",
  in_progress: "進行中",
  done: "已完成",
};

const MILESTONE_STATUSES: MilestoneStatus[] = ["pending", "in_progress", "done"];

// ── 動態 ──

export type UpdateAuthor = "owner" | "client" | "system";

export type CaseUpdate = {
  id: string;
  case_id: string;
  author: UpdateAuthor;
  body: string;
  created_at: string;
};

const UPDATE_AUTHORS: UpdateAuthor[] = ["owner", "client", "system"];

/** 動態／留言／修改意見長度上限（trim 後超過即擋下）。 */
const UPDATE_BODY_MAX = 2000;

// ── 交付物 ──

export type DeliverableStatus = "draft" | "delivered" | "approved" | "rejected";

export type Deliverable = {
  id: string;
  case_id: string;
  milestone_id: string | null;
  title: string;
  file_path: string | null;
  content_md: string | null;
  version: number;
  status: DeliverableStatus;
  is_final: boolean;
  feedback: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export const DELIVERABLE_STATUS_LABELS: Record<DeliverableStatus, string> = {
  draft: "草稿",
  delivered: "待驗收",
  approved: "已驗收",
  rejected: "退回修改",
};

/** 狀態 chip className（沿用 P0 globals.css 既有 .gt-status-chip 系，不新增 CSS）。 */
export const DELIVERABLE_STATUS_COLORS: Record<DeliverableStatus, string> = {
  draft: "gt-status-chip gt-status-chip--draft",
  delivered: "gt-status-chip gt-status-chip--pending",
  approved: "gt-status-chip gt-status-chip--paid",
  rejected: "gt-status-chip gt-status-chip--failed",
};

const DELIVERABLE_STATUSES: DeliverableStatus[] = ["draft", "delivered", "approved", "rejected"];

// ── select 欄位 ──

const CASE_SELECT =
  "id, title, client_name, contact_email, contact_phone, contact_line, source, status, budget, currency, notes, session_id, quote_id, contract_id, deposit_paid_at, final_paid_at, closed_at, auto_opened, created_at, updated_at";

const MILESTONE_SELECT =
  "id, case_id, title, description, due_date, status, sort_order, done_at, created_at, updated_at";

const UPDATE_SELECT = "id, case_id, author, body, created_at";

const DELIVERABLE_SELECT =
  "id, case_id, milestone_id, title, file_path, content_md, version, status, is_final, feedback, approved_at, created_at, updated_at";

// ─────────────────────────────────────────────────────────────
// portal token
// ─────────────────────────────────────────────────────────────

/**
 * 取得（或 lazy 產生）案件的 portal token。
 * 併發安全：條件式 update（portal_token 仍為 null 才寫）——輸家拿不到列 → 回頭讀贏家的 token。
 */
export async function ensurePortalToken(caseId: string): Promise<string | null> {
  const supabase = createAdminSupabase();
  if (!supabase || !caseId) return null;
  try {
    const { data } = await supabase
      .from("client_cases")
      .select("id, portal_token")
      .eq("id", caseId)
      .maybeSingle();
    if (!data) return null;
    const existing = (data as { portal_token: string | null }).portal_token;
    if (existing) return existing;

    const token = randomToken();
    const { data: upd, error } = await supabase
      .from("client_cases")
      .update({ portal_token: token, updated_at: new Date().toISOString() })
      .eq("id", caseId)
      .is("portal_token", null)
      .select("portal_token")
      .maybeSingle();
    if (error) {
      console.error("[portal] ensurePortalToken update failed:", error.message);
      return null;
    }
    if (upd && (upd as { portal_token: string | null }).portal_token) {
      return (upd as { portal_token: string }).portal_token;
    }
    // 沒搶到寫入（併發已有人寫）→ 讀既有值。
    const { data: cur } = await supabase
      .from("client_cases")
      .select("portal_token")
      .eq("id", caseId)
      .maybeSingle();
    return ((cur as { portal_token: string | null } | null)?.portal_token) ?? null;
  } catch (err) {
    console.error("[portal] ensurePortalToken failed:", err);
    return null;
  }
}

/** 以 portal token 取案件；查無／未設定回 null。 */
export async function getCaseByPortalToken(token: string): Promise<ClientCase | null> {
  const supabase = createAdminSupabase();
  if (!supabase || !token) return null;
  try {
    const { data, error } = await supabase
      .from("client_cases")
      .select(CASE_SELECT)
      .eq("portal_token", token)
      .maybeSingle();
    if (error || !data) return null;
    return data as ClientCase;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// 里程碑 CRUD
// ─────────────────────────────────────────────────────────────

/** 案件的里程碑（sort_order → created_at 排序）。出錯回 []。 */
export async function listMilestones(caseId: string): Promise<Milestone[]> {
  const supabase = createAdminSupabase();
  if (!supabase || !caseId) return [];
  try {
    const { data, error } = await supabase
      .from("milestones")
      .select(MILESTONE_SELECT)
      .eq("case_id", caseId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error || !data) return [];
    return data as Milestone[];
  } catch {
    return [];
  }
}

export async function createMilestone(input: {
  case_id: string;
  title: string;
  description?: string;
  due_date?: string | null;
  sort_order?: number;
}): Promise<Milestone | null> {
  const supabase = createAdminSupabase();
  if (!supabase) return null;
  const title = String(input.title ?? "").trim().slice(0, 200);
  if (!input.case_id || !title) return null;
  try {
    const { data, error } = await supabase
      .from("milestones")
      .insert({
        case_id: input.case_id,
        title,
        description: input.description?.trim() ? input.description.trim().slice(0, 2000) : null,
        due_date: input.due_date ? input.due_date : null,
        sort_order: Number.isFinite(Number(input.sort_order)) ? Number(input.sort_order) : 0,
      })
      .select(MILESTONE_SELECT)
      .single();
    if (error || !data) {
      if (error) console.error("[portal] createMilestone failed:", error.message);
      return null;
    }
    return data as Milestone;
  } catch (err) {
    console.error("[portal] createMilestone failed:", err);
    return null;
  }
}

/**
 * 更新里程碑。status 轉為 done：設 done_at ＋ 寫一筆 system 動態（重複設 done 不重寫）；
 * 轉回 pending / in_progress：清 done_at。
 */
export async function updateMilestone(
  id: string,
  patch: Partial<Pick<Milestone, "title" | "description" | "due_date" | "status" | "sort_order">>
): Promise<Milestone | null> {
  const supabase = createAdminSupabase();
  if (!supabase || !id) return null;
  try {
    const { data: before } = await supabase
      .from("milestones")
      .select(MILESTONE_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (!before) return null;
    const prev = before as Milestone;

    const now = new Date().toISOString();
    const upd: Record<string, unknown> = { updated_at: now };
    if (patch.title !== undefined) {
      const t = String(patch.title ?? "").trim().slice(0, 200);
      if (!t) return null; // 不允許清空標題
      upd.title = t;
    }
    if (patch.description !== undefined) {
      upd.description = patch.description?.trim() ? patch.description.trim().slice(0, 2000) : null;
    }
    if (patch.due_date !== undefined) upd.due_date = patch.due_date ? patch.due_date : null;
    if (patch.sort_order !== undefined) upd.sort_order = Number(patch.sort_order) || 0;
    if (patch.status !== undefined) {
      if (!MILESTONE_STATUSES.includes(patch.status)) return null;
      upd.status = patch.status;
      upd.done_at = patch.status === "done" ? (prev.done_at ?? now) : null;
    }

    const { data, error } = await supabase
      .from("milestones")
      .update(upd)
      .eq("id", id)
      .select(MILESTONE_SELECT)
      .maybeSingle();
    if (error || !data) {
      if (error) console.error("[portal] updateMilestone failed:", error.message);
      return null;
    }
    const after = data as Milestone;

    // status →done（原本非 done）→ 寫 system 動態（portal timeline 用；失敗僅 log 不影響更新結果）。
    if (patch.status === "done" && prev.status !== "done") {
      await addUpdate(after.case_id, "system", `里程碑完成：${after.title}`);
    }
    return after;
  } catch (err) {
    console.error("[portal] updateMilestone failed:", err);
    return null;
  }
}

export async function deleteMilestone(id: string): Promise<boolean> {
  const supabase = createAdminSupabase();
  if (!supabase || !id) return false;
  try {
    const { error } = await supabase.from("milestones").delete().eq("id", id);
    return !error;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// 動態（timeline / 留言）
// ─────────────────────────────────────────────────────────────

/** 新增一筆動態。body trim 後為空或超過 2000 字 → 擋下回 null。 */
export async function addUpdate(caseId: string, author: UpdateAuthor, body: string): Promise<CaseUpdate | null> {
  const supabase = createAdminSupabase();
  if (!supabase || !caseId) return null;
  if (!UPDATE_AUTHORS.includes(author)) return null;
  const text = String(body ?? "").trim();
  if (!text || text.length > UPDATE_BODY_MAX) return null;
  try {
    const { data, error } = await supabase
      .from("case_updates")
      .insert({ case_id: caseId, author, body: text })
      .select(UPDATE_SELECT)
      .single();
    if (error || !data) {
      if (error) console.error("[portal] addUpdate failed:", error.message);
      return null;
    }
    return data as CaseUpdate;
  } catch (err) {
    console.error("[portal] addUpdate failed:", err);
    return null;
  }
}

/** 案件動態（新→舊）；limit 未給則不限。出錯回 []。 */
export async function listUpdates(caseId: string, limit?: number): Promise<CaseUpdate[]> {
  const supabase = createAdminSupabase();
  if (!supabase || !caseId) return [];
  try {
    let query = supabase
      .from("case_updates")
      .select(UPDATE_SELECT)
      .eq("case_id", caseId)
      .order("created_at", { ascending: false });
    if (limit !== undefined && Number.isFinite(limit) && limit > 0) query = query.limit(Math.floor(limit));
    const { data, error } = await query;
    if (error || !data) return [];
    return data as CaseUpdate[];
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// 交付物 CRUD ＋ 客戶線上驗收
// ─────────────────────────────────────────────────────────────

/** 案件交付物（新→舊）。預設不含 draft（portal 用）；後台帶 includeDraft:true。 */
export async function listDeliverables(caseId: string, opts?: { includeDraft?: boolean }): Promise<Deliverable[]> {
  const supabase = createAdminSupabase();
  if (!supabase || !caseId) return [];
  try {
    let query = supabase
      .from("deliverables")
      .select(DELIVERABLE_SELECT)
      .eq("case_id", caseId)
      .order("created_at", { ascending: false });
    if (!opts?.includeDraft) query = query.neq("status", "draft");
    const { data, error } = await query;
    if (error || !data) return [];
    return data as Deliverable[];
  } catch {
    return [];
  }
}

export async function createDeliverable(input: {
  case_id: string;
  milestone_id?: string | null;
  title: string;
  file_path?: string | null;
  content_md?: string | null;
  is_final?: boolean;
  status?: DeliverableStatus;
}): Promise<Deliverable | null> {
  const supabase = createAdminSupabase();
  if (!supabase) return null;
  const title = String(input.title ?? "").trim().slice(0, 200);
  if (!input.case_id || !title) return null;
  const status: DeliverableStatus =
    input.status && DELIVERABLE_STATUSES.includes(input.status) ? input.status : "delivered";
  try {
    const { data, error } = await supabase
      .from("deliverables")
      .insert({
        case_id: input.case_id,
        milestone_id: input.milestone_id || null,
        title,
        file_path: input.file_path || null,
        content_md: input.content_md?.trim() ? input.content_md : null,
        is_final: !!input.is_final,
        status,
      })
      .select(DELIVERABLE_SELECT)
      .single();
    if (error || !data) {
      if (error) console.error("[portal] createDeliverable failed:", error.message);
      return null;
    }
    return data as Deliverable;
  } catch (err) {
    console.error("[portal] createDeliverable failed:", err);
    return null;
  }
}

/** 更新交付物（後台用）。status 改為 approved 補 approved_at；改為其他狀態清 approved_at。 */
export async function updateDeliverable(
  id: string,
  patch: Partial<Pick<Deliverable, "title" | "milestone_id" | "is_final" | "status" | "content_md">>
): Promise<Deliverable | null> {
  const supabase = createAdminSupabase();
  if (!supabase || !id) return null;
  try {
    const { data: before } = await supabase
      .from("deliverables")
      .select(DELIVERABLE_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (!before) return null;
    const prev = before as Deliverable;

    const now = new Date().toISOString();
    const upd: Record<string, unknown> = { updated_at: now };
    if (patch.title !== undefined) {
      const t = String(patch.title ?? "").trim().slice(0, 200);
      if (!t) return null; // 不允許清空標題
      upd.title = t;
    }
    if (patch.milestone_id !== undefined) upd.milestone_id = patch.milestone_id || null;
    if (patch.is_final !== undefined) upd.is_final = !!patch.is_final;
    if (patch.content_md !== undefined) upd.content_md = patch.content_md?.trim() ? patch.content_md : null;
    if (patch.status !== undefined) {
      if (!DELIVERABLE_STATUSES.includes(patch.status)) return null;
      upd.status = patch.status;
      upd.approved_at = patch.status === "approved" ? (prev.approved_at ?? now) : null;
    }

    const { data, error } = await supabase
      .from("deliverables")
      .update(upd)
      .eq("id", id)
      .select(DELIVERABLE_SELECT)
      .maybeSingle();
    if (error || !data) {
      if (error) console.error("[portal] updateDeliverable failed:", error.message);
      return null;
    }
    return data as Deliverable;
  } catch (err) {
    console.error("[portal] updateDeliverable failed:", err);
    return null;
  }
}

/**
 * 發布草稿交付物給客戶：僅 status='draft' 可發布 → 'delivered'。
 * 條件式 update（status 仍為 draft 才生效）——併發連點恰好一次成功，輸家回 not_draft，
 * 呼叫端據此不重寄通知信。
 */
export async function publishDeliverableDraft(
  id: string
): Promise<{ ok: true; deliverable: Deliverable } | { ok: false; reason: "not_found" | "not_draft" | "db" }> {
  const supabase = createAdminSupabase();
  if (!supabase || !id) return { ok: false, reason: "db" };
  try {
    const { data: before } = await supabase
      .from("deliverables")
      .select(DELIVERABLE_SELECT)
      .eq("id", id)
      .maybeSingle();
    const prev = (before as Deliverable | null) ?? null;
    if (!prev) return { ok: false, reason: "not_found" };
    if (prev.status !== "draft") return { ok: false, reason: "not_draft" };

    const { data, error } = await supabase
      .from("deliverables")
      .update({ status: "delivered", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "draft") // 條件式：併發下只有一次轉換成功
      .select(DELIVERABLE_SELECT)
      .maybeSingle();
    if (error) {
      console.error("[portal] publishDeliverableDraft failed:", error.message);
      return { ok: false, reason: "db" };
    }
    if (!data) return { ok: false, reason: "not_draft" }; // 沒搶到轉換（併發已發布）
    return { ok: true, deliverable: data as Deliverable };
  } catch (err) {
    console.error("[portal] publishDeliverableDraft failed:", err);
    return { ok: false, reason: "db" };
  }
}

export async function deleteDeliverable(id: string): Promise<boolean> {
  const supabase = createAdminSupabase();
  if (!supabase || !id) return false;
  try {
    const { error } = await supabase.from("deliverables").delete().eq("id", id);
    return !error;
  } catch {
    return false;
  }
}

/**
 * 客戶在 portal 驗收交付物。
 * - 歸屬驗證：token → case，deliverable.case_id 必須等於該 case（不符回 null）。
 * - 僅 status='delivered' 可審；冪等：已是目標狀態（如已 approved 再 approve）→ 回既有、finalTriggered:false。
 * - 併發安全：條件式 update（status 仍為 delivered 才生效）→ 連點恰好一次成功，不重觸發完工。
 * - approve → status approved + approved_at ＋ system 動態「客戶已驗收：<title>」；
 *   is_final → 觸發 P0 完工流程 completeCaseAndRequestFinal → finalTriggered:true。
 * - reject → status rejected + feedback ＋ system 動態 ＋ email 通知老闆。
 */
export async function reviewDeliverableByPortal(
  portalToken: string,
  deliverableId: string,
  action: "approve" | "reject",
  feedback?: string
): Promise<{ deliverable: Deliverable; finalTriggered: boolean } | null> {
  const supabase = createAdminSupabase();
  if (!supabase || !portalToken || !deliverableId) return null;
  if (action !== "approve" && action !== "reject") return null;

  const caseRow = await getCaseByPortalToken(portalToken);
  if (!caseRow) return null;

  let deliverable: Deliverable | null = null;
  try {
    const { data } = await supabase
      .from("deliverables")
      .select(DELIVERABLE_SELECT)
      .eq("id", deliverableId)
      .maybeSingle();
    deliverable = (data as Deliverable | null) ?? null;
  } catch {
    return null;
  }
  if (!deliverable) return null;
  if (deliverable.case_id !== caseRow.id) return null; // 歸屬驗證：不是這個 token 的案件

  const target: DeliverableStatus = action === "approve" ? "approved" : "rejected";
  // 冪等：已是目標狀態 → 回既有結果，不重寫、不重觸發完工／通知。
  if (deliverable.status === target) return { deliverable, finalTriggered: false };
  // 僅「待驗收」可審（draft／另一種已審結果 → 不可作用）。
  if (deliverable.status !== "delivered") return null;

  const now = new Date().toISOString();
  const trimmedFeedback = feedback?.trim() ? feedback.trim().slice(0, UPDATE_BODY_MAX) : null;
  const upd: Record<string, unknown> = { status: target, updated_at: now };
  if (action === "approve") upd.approved_at = now;
  else upd.feedback = trimmedFeedback;

  let updated: Deliverable | null = null;
  try {
    const { data, error } = await supabase
      .from("deliverables")
      .update(upd)
      .eq("id", deliverableId)
      .eq("status", "delivered") // 條件式：併發下只有一次轉換成功
      .select(DELIVERABLE_SELECT)
      .maybeSingle();
    if (error) {
      console.error("[portal] reviewDeliverableByPortal update failed:", error.message);
      return null;
    }
    updated = (data as Deliverable | null) ?? null;
  } catch (err) {
    console.error("[portal] reviewDeliverableByPortal failed:", err);
    return null;
  }

  if (!updated) {
    // 沒搶到轉換（併發已審過）：與目標狀態一致視為冪等成功，否則 null。
    try {
      const { data } = await supabase
        .from("deliverables")
        .select(DELIVERABLE_SELECT)
        .eq("id", deliverableId)
        .maybeSingle();
      const cur = (data as Deliverable | null) ?? null;
      return cur && cur.status === target ? { deliverable: cur, finalTriggered: false } : null;
    } catch {
      return null;
    }
  }

  // DB 已落地 → 動態與通知（寄信失敗僅 log，不影響審核結果）。
  if (action === "approve") {
    await addUpdate(caseRow.id, "system", `客戶已驗收：${updated.title}`);
    let finalTriggered = false;
    if (updated.is_final) {
      // 最終交付驗收通過 → 自動觸發 P0 完工流程（case→已完成、開尾款單、寄請款信）。
      // 失敗不可靜默：交付物已 approved（冪等分支不會再觸發完工），必須讓老闆看見並可手動重試。
      const result = await completeCaseAndRequestFinal(caseRow.id);
      if (result.ok) {
        finalTriggered = true;
      } else {
        console.error("[portal] 驗收已通過但自動完工/請款失敗（case:", caseRow.id, "）");
        await sendOwnerEventNotice(`⚠️ 客戶已驗收，但自動完工/請款失敗：${caseRow.client_name}`, [
          `案件：${caseRow.title}`,
          `交付物：${updated.title}`,
          "請至後台案件詳情按「標記完工並請尾款」手動重試（流程冪等、不會重複開單）。",
        ]);
      }
    }
    return { deliverable: updated, finalTriggered };
  }

  await addUpdate(caseRow.id, "system", `客戶要求修改：${updated.title}`);
  await sendOwnerEventNotice(`✏️ 客戶要求修改交付物：${caseRow.client_name}`, [
    `案件：${caseRow.title}`,
    `交付物：${updated.title}`,
    trimmedFeedback ? `修改意見：${trimmedFeedback}` : "",
  ]);
  return { deliverable: updated, finalTriggered: false };
}

/** 里程碑進度（done／total／百分比；空清單 pct=0）。 */
export function milestonesProgress(list: Milestone[]): { done: number; total: number; pct: number } {
  const total = list?.length ?? 0;
  const done = (list ?? []).filter((m) => m.status === "done").length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return { done, total, pct };
}
