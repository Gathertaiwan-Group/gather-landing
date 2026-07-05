"use client";

import { useState } from "react";
import { CASE_STATUSES, CASE_SOURCES, SOURCE_LABELS, type ClientCase } from "@/lib/adminCases";

const BRAND_BLUE = "#1668c2";

type Props = {
  open: boolean;
  initial?: Partial<ClientCase> | null;
  onClose: () => void;
  onSaved: () => void;
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: "#6e6e73",
  marginBottom: 6,
};
const fieldStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid rgba(0,0,0,.14)",
  borderRadius: 12,
  padding: "10px 13px",
  fontSize: 14.5,
  outline: "none",
  background: "#fff",
  color: "#1d1d1f",
};

/** 新增 / 編輯案件的 Modal。有 initial.id → PATCH（編輯，含刪除）；否則 POST（新增）。 */
export default function CaseFormModal({ open, initial, onClose, onSaved }: Props) {
  const editingId = initial?.id;

  // 受控欄位（以 initial 播種）
  const [title, setTitle] = useState(initial?.title ?? "");
  const [clientName, setClientName] = useState(initial?.client_name ?? "");
  const [email, setEmail] = useState(initial?.contact_email ?? "");
  const [phone, setPhone] = useState(initial?.contact_phone ?? "");
  const [line, setLine] = useState(initial?.contact_line ?? "");
  const [source, setSource] = useState(initial?.source ?? "manual");
  const [status, setStatus] = useState(initial?.status ?? "洽談中");
  const [budget, setBudget] = useState(
    initial?.budget != null ? String(initial.budget) : ""
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const sessionId = initial?.session_id ?? null; // 隱藏帶入

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim() || !clientName.trim()) {
      setError("請填寫「案件名稱」與「客戶」");
      return;
    }

    const budgetNum = budget.trim() === "" ? null : Number(budget);
    if (budgetNum != null && Number.isNaN(budgetNum)) {
      setError("預算請輸入數字");
      return;
    }

    const payload: Record<string, unknown> = {
      title: title.trim(),
      client_name: clientName.trim(),
      contact_email: email.trim() || null,
      contact_phone: phone.trim() || null,
      contact_line: line.trim() || null,
      source,
      status,
      budget: budgetNum,
      notes: notes.trim() || null,
      session_id: sessionId,
    };
    if (editingId) payload.id = editingId;

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/cases", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        setError(data?.message || data?.error || "儲存失敗，請稍後再試");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("連線出了點問題，請稍後再試");
    } finally {
      setSubmitting(false);
    }
  }

  async function remove() {
    if (!editingId) return;
    if (!confirm("確定要刪除這個案件嗎？此動作無法復原。")) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/cases", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        setError(data?.message || data?.error || "刪除失敗，請稍後再試");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("連線出了點問題，請稍後再試");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(20,30,50,.44)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "6vh 16px",
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={editingId ? "編輯案件" : "新增案件"}
        style={{
          width: "100%",
          maxWidth: 560,
          background: "#fff",
          borderRadius: 24,
          padding: "clamp(22px,4vw,32px)",
          boxShadow: "0 24px 60px rgba(20,40,80,.28)",
        }}
      >
        {/* 標題列 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#1d1d1f" }}>
            {editingId ? "編輯案件" : "新增案件"}
          </h2>
          <button
            onClick={onClose}
            aria-label="關閉"
            style={{
              border: "none",
              background: "transparent",
              fontSize: 20,
              color: "#86868b",
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={submit} style={{ display: "grid", gap: 16 }}>
          <div>
            <label style={labelStyle}>
              案件名稱 <span style={{ color: "#d23f3f" }}>*</span>
            </label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={fieldStyle} placeholder="例：形象官網建置" />
          </div>

          <div>
            <label style={labelStyle}>
              客戶 <span style={{ color: "#d23f3f" }}>*</span>
            </label>
            <input value={clientName} onChange={(e) => setClientName(e.target.value)} style={fieldStyle} placeholder="客戶 / 公司名稱" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={labelStyle}>來源</label>
              <select value={source} onChange={(e) => setSource(e.target.value)} style={fieldStyle}>
                {CASE_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {SOURCE_LABELS[s] ?? s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>狀態</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} style={fieldStyle}>
                {CASE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={labelStyle}>Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} style={fieldStyle} placeholder="選填" />
            </div>
            <div>
              <label style={labelStyle}>電話</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} style={fieldStyle} placeholder="選填" />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={labelStyle}>LINE</label>
              <input value={line} onChange={(e) => setLine(e.target.value)} style={fieldStyle} placeholder="選填" />
            </div>
            <div>
              <label style={labelStyle}>預算（TWD）</label>
              <input
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                inputMode="numeric"
                style={fieldStyle}
                placeholder="選填，如 120000"
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>備註</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              style={{ ...fieldStyle, resize: "vertical", lineHeight: 1.6 }}
              placeholder="需求、對話摘要等"
            />
          </div>

          {error && (
            <div
              style={{
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

          {/* 動作列 */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 4 }}>
            {editingId ? (
              <button
                type="button"
                onClick={remove}
                disabled={submitting}
                style={{
                  border: "1px solid #f0c4c0",
                  background: "#fff",
                  color: "#c0392b",
                  borderRadius: 980,
                  padding: "10px 18px",
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: submitting ? "default" : "pointer",
                  opacity: submitting ? 0.5 : 1,
                }}
              >
                刪除
              </button>
            ) : (
              <span />
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                style={{
                  border: "1px solid rgba(0,0,0,.14)",
                  background: "#fff",
                  color: "#1d1d1f",
                  borderRadius: 980,
                  padding: "10px 20px",
                  fontSize: 14,
                  cursor: submitting ? "default" : "pointer",
                  opacity: submitting ? 0.5 : 1,
                }}
              >
                取消
              </button>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  border: "none",
                  background: BRAND_BLUE,
                  color: "#fff",
                  borderRadius: 980,
                  padding: "10px 24px",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: submitting ? "default" : "pointer",
                  opacity: submitting ? 0.6 : 1,
                }}
              >
                {submitting ? "儲存中…" : editingId ? "儲存變更" : "新增案件"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
