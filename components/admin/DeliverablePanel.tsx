"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DELIVERABLE_STATUS_LABELS,
  DELIVERABLE_STATUS_COLORS,
  type Deliverable,
} from "@/lib/portal";

const BRAND_BLUE = "#1668c2";
const MAX_FILE_BYTES = 4 * 1024 * 1024; // 與 API 一致：4MB（Vercel body 上限）

type Props = {
  caseId: string;
  deliverables: Deliverable[];
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
  padding: "9px 12px",
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

// YYYY.MM.DD HH:mm（照後台其他頁格式）
function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** P1：交付物管理——上傳（檔案或文字擇一）發布給客戶驗收＋is_final 標記＋刪除。
 *  P2：一鍵 AI 產生初稿（draft 僅老闆可見）→ 編輯 → 發布給客戶。 */
export default function DeliverablePanel({ caseId, deliverables }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 上傳表單
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0); // 重掛 file input 用
  const [contentMd, setContentMd] = useState("");
  const [isFinal, setIsFinal] = useState(false);

  // P2：AI 產生初稿＋草稿編輯 modal
  const [genBusy, setGenBusy] = useState(false);
  const [editing, setEditing] = useState<Deliverable | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

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

  async function publish() {
    const t = title.trim();
    if (!t) {
      setError("請填交付物標題");
      return;
    }
    const hasContent = !!contentMd.trim();
    if (file && hasContent) {
      setError("檔案與文字內容擇一即可");
      return;
    }
    if (!file && !hasContent) {
      setError("請上傳檔案或貼上文字內容");
      return;
    }
    if (file && file.size > MAX_FILE_BYTES) {
      setError("檔案超過 4MB 上限（更大檔案請貼雲端連結到內容欄）");
      return;
    }
    await call(async () => {
      const form = new FormData();
      form.set("case_id", caseId);
      form.set("title", t);
      if (isFinal) form.set("is_final", "true");
      if (file) form.set("file", file);
      else form.set("content_md", contentMd);

      const res = await fetch("/api/admin/deliverables", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        setError(data?.message || data?.error || "發布失敗，請稍後再試");
        return;
      }
      setTitle("");
      setFile(null);
      setFileKey((k) => k + 1);
      setContentMd("");
      setIsFinal(false);
      setNotice(
        data.emailed
          ? "已發布交付物，驗收通知已寄給客戶 ✅"
          : "已發布交付物 ✅（未寄通知：客戶沒有 Email 或寄信未設定）"
      );
    });
  }

  // ── P2：一鍵 AI 產生初稿（冪等：已產過的 generator 會 skip）──
  async function generateDrafts() {
    setGenBusy(true);
    await call(async () => {
      const res = await fetch("/api/admin/cases/generate-drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: caseId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        setError(data?.message || data?.error || "AI 初稿產生失敗，請稍後再試");
        return;
      }
      const parts: string[] = [];
      if (data.created > 0) parts.push(`新增 ${data.created} 份草稿`);
      if (data.skipped > 0) parts.push(`${data.skipped} 份已存在（略過）`);
      if (data.failed > 0) parts.push(`${data.failed} 份失敗`);
      setNotice(`AI 初稿完成 ✅ ${parts.join("、") || "無新增"}——草稿僅你可見，編輯確認後再發布給客戶`);
    });
    setGenBusy(false);
  }

  // ── P2：發布草稿給客戶（status draft → delivered ＋ 寄驗收通知）──
  async function publishDraft(d: Deliverable) {
    await call(async () => {
      const res = await fetch("/api/admin/deliverables", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: d.id, action: "publish" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        setError(data?.message || data?.error || "發布失敗，請稍後再試");
        return;
      }
      setNotice(
        data.emailed
          ? "已發布給客戶，驗收通知已寄出 ✅"
          : "已發布給客戶 ✅（未寄通知：客戶沒有 Email 或寄信未設定）"
      );
    });
  }

  // ── P2：編輯草稿（title＋content_md）──
  function openEdit(d: Deliverable) {
    setError(null);
    setNotice(null);
    setEditing(d);
    setEditTitle(d.title);
    setEditContent(d.content_md ?? "");
  }

  async function saveEdit() {
    if (!editing) return;
    const t = editTitle.trim();
    if (!t) {
      setError("交付物標題不可為空");
      return;
    }
    if (!editing.file_path && !editContent.trim()) {
      setError("文字型交付物的內容不可為空");
      return;
    }
    await call(async () => {
      const res = await fetch("/api/admin/deliverables", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing.id, title: t, content_md: editContent }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        setError(data?.message || data?.error || "儲存失敗，請稍後再試");
        return;
      }
      setEditing(null);
      setNotice("草稿已更新 ✅");
    });
  }

  async function toggleFinal(d: Deliverable) {
    await call(async () => {
      const res = await fetch("/api/admin/deliverables", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: d.id, is_final: !d.is_final }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        setError(data?.message || data?.error || "更新失敗，請稍後再試");
        return;
      }
      setNotice(!d.is_final ? "已設為最終交付（客戶驗收通過即自動完工請尾款）✅" : "已取消最終交付標記 ✅");
    });
  }

  async function remove(d: Deliverable) {
    const hint = d.file_path ? "（附帶檔案將一併刪除）" : "";
    if (!confirm(`確定刪除交付物「${d.title}」？${hint}此動作無法復原。`)) return;
    await call(async () => {
      const res = await fetch("/api/admin/deliverables", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: d.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        setError(data?.message || data?.error || "刪除失敗，請稍後再試");
        return;
      }
      setNotice("已刪除交付物");
    });
  }

  return (
    <div className="gt-admin-card">
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "0 0 14px" }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: "#1d1d1f", margin: 0 }}>交付物</h2>
        <button
          type="button"
          onClick={generateDrafts}
          disabled={busy}
          style={{ ...outlineBtn, marginLeft: "auto", opacity: busy ? 0.6 : 1 }}
          title="依報價項目與售前對話，AI 產出網站文案／網站架構／設計方向初稿（存成僅你可見的草稿）"
        >
          {genBusy ? "AI 產生中…（約 30 秒）" : "🤖 AI 產生初稿"}
        </button>
      </div>

      {deliverables.length === 0 ? (
        <p style={{ fontSize: 13.5, color: "#86868b", margin: "0 0 16px" }}>
          還沒有交付物。可按右上「🤖 AI 產生初稿」讓 AI 先擬草稿（僅你可見、編輯後發布），或用下方表單上傳檔案／貼上文字內容。
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          {deliverables.map((d) => (
            <div
              key={d.id}
              style={{
                border: "1px solid rgba(0,0,0,.08)",
                borderRadius: 12,
                padding: "10px 12px",
                display: "grid",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 14.5, fontWeight: 600, color: "#1d1d1f" }}>{d.title}</span>
                <span className={DELIVERABLE_STATUS_COLORS[d.status]}>
                  {d.status === "draft" ? "草稿（僅你可見）" : (DELIVERABLE_STATUS_LABELS[d.status] ?? d.status)}
                </span>
                {d.is_final && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#8a6d00",
                      background: "#fff4d1",
                      borderRadius: 6,
                      padding: "2px 7px",
                      letterSpacing: ".04em",
                      whiteSpace: "nowrap",
                    }}
                  >
                    最終交付
                  </span>
                )}
                <span style={{ fontSize: 12.5, color: "#86868b", marginLeft: "auto", whiteSpace: "nowrap" }}>
                  v{d.version}｜{d.file_path ? "檔案" : "文字內容"}｜{formatDateTime(d.created_at)}
                </span>
              </div>

              {d.status === "rejected" && d.feedback && (
                <div
                  style={{
                    fontSize: 13,
                    color: "#b3261e",
                    background: "#fdecea",
                    borderRadius: 10,
                    padding: "8px 11px",
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.6,
                  }}
                >
                  客戶修改意見：{d.feedback}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {d.status === "draft" && (
                  <>
                    <button type="button" onClick={() => openEdit(d)} disabled={busy} style={{ ...outlineBtn, opacity: busy ? 0.6 : 1 }}>
                      編輯
                    </button>
                    <button
                      type="button"
                      onClick={() => publishDraft(d)}
                      disabled={busy}
                      style={{
                        border: "none",
                        background: BRAND_BLUE,
                        color: "#fff",
                        borderRadius: 980,
                        padding: "6px 14px",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: busy ? "default" : "pointer",
                        whiteSpace: "nowrap",
                        opacity: busy ? 0.6 : 1,
                      }}
                    >
                      發布給客戶
                    </button>
                  </>
                )}
                <button type="button" onClick={() => toggleFinal(d)} disabled={busy} style={{ ...outlineBtn, opacity: busy ? 0.6 : 1 }}>
                  {d.is_final ? "取消最終交付" : "設為最終交付"}
                </button>
                <button type="button" onClick={() => remove(d)} disabled={busy} style={{ ...dangerBtn, opacity: busy ? 0.6 : 1 }}>
                  刪除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 上傳／發布表單 */}
      <div style={{ borderTop: "1px solid rgba(0,0,0,.08)", paddingTop: 14, display: "grid", gap: 12 }}>
        <div>
          <label style={labelStyle}>交付物標題</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={fieldStyle}
            placeholder="例：首頁視覺設計稿 v1"
          />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
          <div>
            <label style={labelStyle}>上傳檔案（4MB 內）</label>
            <input
              key={fileKey}
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              style={{ ...fieldStyle, padding: "7px 10px" }}
            />
          </div>
          <div>
            <label style={labelStyle}>或貼上文字內容（Markdown，擇一）</label>
            <textarea
              value={contentMd}
              onChange={(e) => setContentMd(e.target.value)}
              rows={3}
              style={{ ...fieldStyle, resize: "vertical", lineHeight: 1.6 }}
              placeholder="文字型交付（規格書、文案等）直接貼這裡"
            />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: "#6e6e73", cursor: "pointer" }}>
            <input type="checkbox" checked={isFinal} onChange={(e) => setIsFinal(e.target.checked)} />
            最終交付（客戶驗收通過後自動完工並請尾款）
          </label>
          <button
            type="button"
            onClick={publish}
            disabled={busy}
            style={{
              border: "none",
              background: BRAND_BLUE,
              color: "#fff",
              borderRadius: 980,
              padding: "9px 22px",
              fontSize: 14,
              fontWeight: 600,
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.6 : 1,
              marginLeft: "auto",
            }}
          >
            {busy ? "處理中…" : "發布並通知客戶"}
          </button>
        </div>
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

      {/* P2：草稿編輯 modal（title＋content_md；儲存後仍是草稿，另按「發布給客戶」才對外） */}
      {editing && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => !busy && setEditing(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.4)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: "20px 22px",
              width: "min(760px, 100%)",
              maxHeight: "88vh",
              overflowY: "auto",
              boxShadow: "0 18px 50px rgba(0,0,0,.22)",
              display: "grid",
              gap: 14,
            }}
          >
            <h3 style={{ fontSize: 16.5, fontWeight: 700, color: "#1d1d1f", margin: 0 }}>編輯草稿</h3>
            <div>
              <label style={labelStyle}>標題</label>
              <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>內容（Markdown）</label>
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={16}
                style={{
                  ...fieldStyle,
                  resize: "vertical",
                  lineHeight: 1.7,
                  fontSize: 13.5,
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                onClick={() => setEditing(null)}
                disabled={busy}
                style={{ ...outlineBtn, borderColor: "rgba(0,0,0,.2)", color: "#6e6e73", opacity: busy ? 0.6 : 1 }}
              >
                取消
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={busy}
                style={{
                  border: "none",
                  background: BRAND_BLUE,
                  color: "#fff",
                  borderRadius: 980,
                  padding: "8px 20px",
                  fontSize: 13.5,
                  fontWeight: 600,
                  cursor: busy ? "default" : "pointer",
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {busy ? "儲存中…" : "儲存草稿"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
