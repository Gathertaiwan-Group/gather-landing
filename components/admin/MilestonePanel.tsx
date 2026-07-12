"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MILESTONE_STATUS_LABELS, type Milestone, type MilestoneStatus } from "@/lib/portal";

const BRAND_BLUE = "#1668c2";

type Props = {
  caseId: string;
  milestones: Milestone[];
  /** ensurePortalToken 取得的 token（null＝資料庫未設定，顯示提示）。 */
  portalToken: string | null;
};

const fieldStyle: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,.14)",
  borderRadius: 12,
  padding: "8px 11px",
  fontSize: 14,
  outline: "none",
  background: "#fff",
  color: "#1d1d1f",
};
const outlineBtn: React.CSSProperties = {
  border: `1px solid ${BRAND_BLUE}`,
  background: "#fff",
  color: BRAND_BLUE,
  borderRadius: 980,
  padding: "6px 14px",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
const dangerBtn: React.CSSProperties = {
  border: "1px solid #f0c4c0",
  background: "#fff",
  color: "#c0392b",
  borderRadius: 980,
  padding: "6px 14px",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

// YYYY.MM.DD（里程碑用日期就好）
function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

/** 客戶端可讀取的站台網址（NEXT_PUBLIC 若沒被 inline 就退回 window.origin）。 */
function siteOrigin(): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

const STATUS_DOT: Record<MilestoneStatus, string> = {
  pending: "#c7c7cc",
  in_progress: "#1668c2",
  done: "#1f7a44",
};

/** P1：客戶進度頁連結（複製鈕）＋里程碑管理（新增／改狀態／改標題／刪除）。 */
export default function MilestonePanel({ caseId, milestones, portalToken }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 新增列
  const [newTitle, setNewTitle] = useState("");
  const [newDue, setNewDue] = useState("");

  // 改標題（一次編輯一列）
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const portalUrl = portalToken ? `${siteOrigin()}/portal/${portalToken}` : null;

  async function copyPortalLink() {
    if (!portalUrl) return;
    try {
      await navigator.clipboard.writeText(portalUrl);
      setError(null);
      setNotice("已複製客戶進度頁連結 ✅");
    } catch {
      /* 剪貼簿失敗就忽略 */
    }
  }

  async function call(fn: () => Promise<void>) {
    if (busy) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await fn();
      router.refresh();
    } catch {
      setError("連線出了點問題，請稍後再試");
    } finally {
      setBusy(false);
    }
  }

  async function addMilestone() {
    const title = newTitle.trim();
    if (!title) {
      setError("請先填里程碑標題");
      return;
    }
    await call(async () => {
      const res = await fetch("/api/admin/milestones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ case_id: caseId, title, due_date: newDue || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        setError(data?.message || data?.error || "新增失敗，請稍後再試");
        return;
      }
      setNewTitle("");
      setNewDue("");
      setNotice("已新增里程碑 ✅");
    });
  }

  async function patchMilestone(id: string, patch: Record<string, unknown>, okMsg: string) {
    await call(async () => {
      const res = await fetch("/api/admin/milestones", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        setError(data?.message || data?.error || "更新失敗，請稍後再試");
        return;
      }
      setNotice(okMsg);
    });
  }

  async function changeStatus(m: Milestone, status: MilestoneStatus) {
    if (status === m.status) return;
    await patchMilestone(
      m.id,
      { status },
      status === "done" ? "已標記完成（進度頁 timeline 會多一筆系統動態）✅" : "已更新狀態 ✅"
    );
  }

  function startEdit(m: Milestone) {
    setEditingId(m.id);
    setEditTitle(m.title);
  }

  async function saveTitle(m: Milestone) {
    const t = editTitle.trim();
    if (!t) {
      setError("標題不可為空");
      return;
    }
    if (t === m.title) {
      setEditingId(null);
      return;
    }
    await patchMilestone(m.id, { title: t }, "已更新標題 ✅");
    setEditingId(null);
  }

  async function removeMilestone(m: Milestone) {
    if (!confirm(`確定刪除里程碑「${m.title}」？客戶進度頁將不再顯示。`)) return;
    await call(async () => {
      const res = await fetch("/api/admin/milestones", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: m.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        setError(data?.message || data?.error || "刪除失敗，請稍後再試");
        return;
      }
      setNotice("已刪除里程碑");
    });
  }

  const done = milestones.filter((m) => m.status === "done").length;

  return (
    <>
      {/* 客戶進度頁連結 */}
      <div className="gt-admin-card">
        <h2 style={{ fontSize: 17, fontWeight: 700, color: "#1d1d1f", margin: "0 0 10px" }}>客戶進度頁</h2>
        {portalUrl ? (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                readOnly
                value={portalUrl}
                style={{ ...fieldStyle, flex: 1, minWidth: 220, background: "#f5f5f7" }}
              />
              <button type="button" onClick={copyPortalLink} style={outlineBtn}>
                複製連結
              </button>
            </div>
            <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "#86868b" }}>
              客戶用這條連結即可查看里程碑進度、最新動態與交付物，並在線上留言、驗收（不需登入）。
            </p>
          </>
        ) : (
          <p style={{ fontSize: 13.5, color: "#86868b", margin: 0 }}>
            尚無法產生進度頁連結（資料庫未設定），請稍後再試。
          </p>
        )}
      </div>

      {/* 里程碑管理 */}
      <div className="gt-admin-card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: "#1d1d1f", margin: 0 }}>里程碑</h2>
          <span style={{ fontSize: 12.5, color: "#86868b" }}>
            {milestones.length > 0 ? `${done}／${milestones.length} 完成` : ""}
          </span>
        </div>

        {milestones.length === 0 ? (
          <p style={{ fontSize: 13.5, color: "#86868b", margin: "0 0 14px" }}>
            還沒有里程碑，先在下方加幾個階段（例：需求確認、設計稿、開發、上線）。
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
            {milestones.map((m) => (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                  border: "1px solid rgba(0,0,0,.08)",
                  borderRadius: 12,
                  padding: "10px 12px",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    background: STATUS_DOT[m.status] ?? "#c7c7cc",
                    flexShrink: 0,
                  }}
                />
                {editingId === m.id ? (
                  <>
                    <input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      style={{ ...fieldStyle, flex: 1, minWidth: 160 }}
                      autoFocus
                    />
                    <button type="button" onClick={() => saveTitle(m)} disabled={busy} style={{ ...outlineBtn, opacity: busy ? 0.6 : 1 }}>
                      儲存
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      style={{ ...outlineBtn, border: "1px solid rgba(0,0,0,.14)", color: "#6e6e73" }}
                    >
                      取消
                    </button>
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1, minWidth: 160, fontSize: 14.5, color: "#1d1d1f", fontWeight: 500 }}>
                      {m.title}
                    </span>
                    <span style={{ fontSize: 12.5, color: "#86868b", whiteSpace: "nowrap" }}>
                      到期 {formatDate(m.due_date)}
                      {m.status === "done" && `｜完成於 ${formatDate(m.done_at)}`}
                    </span>
                    <select
                      value={m.status}
                      onChange={(e) => changeStatus(m, e.target.value as MilestoneStatus)}
                      disabled={busy}
                      style={{ ...fieldStyle, padding: "6px 8px", fontSize: 13, cursor: "pointer" }}
                    >
                      {(Object.keys(MILESTONE_STATUS_LABELS) as MilestoneStatus[]).map((s) => (
                        <option key={s} value={s}>
                          {MILESTONE_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={() => startEdit(m)} disabled={busy} style={{ ...outlineBtn, opacity: busy ? 0.6 : 1 }}>
                      改標題
                    </button>
                    <button
                      type="button"
                      onClick={() => removeMilestone(m)}
                      disabled={busy}
                      style={{ ...dangerBtn, opacity: busy ? 0.6 : 1 }}
                    >
                      刪除
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 新增列 */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="新里程碑標題（例：視覺設計稿）"
            style={{ ...fieldStyle, flex: 1, minWidth: 200 }}
          />
          <input
            type="date"
            value={newDue}
            onChange={(e) => setNewDue(e.target.value)}
            style={{ ...fieldStyle, width: 150 }}
            aria-label="到期日（選填）"
          />
          <button type="button" onClick={addMilestone} disabled={busy} style={{ ...outlineBtn, opacity: busy ? 0.6 : 1 }}>
            ＋ 新增里程碑
          </button>
        </div>

        {error && (
          <div
            style={{
              marginTop: 12,
              fontSize: 13.5,
              color: "#b3261e",
              background: "#fdecea",
              border: "1px solid #f6c9c4",
              borderRadius: 12,
              padding: "10px 13px",
            }}
          >
            {error}
          </div>
        )}
        {notice && !error && (
          <div
            style={{
              marginTop: 12,
              fontSize: 13.5,
              color: "#1f7a44",
              background: "#dcf3e5",
              border: "1px solid #bfe6cd",
              borderRadius: 12,
              padding: "10px 13px",
            }}
          >
            {notice}
          </div>
        )}
      </div>
    </>
  );
}
