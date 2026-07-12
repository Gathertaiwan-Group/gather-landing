"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CaseUpdate, UpdateAuthor } from "@/lib/portal";

const BRAND_BLUE = "#1668c2";
const BODY_MAX = 2000;

type Props = {
  caseId: string;
  /** 新→舊（listUpdates 排序）。 */
  updates: CaseUpdate[];
  /** 案件是否留有客戶 Email（沒有＝回覆只寫進度頁、不寄信）。 */
  hasClientEmail: boolean;
};

const AUTHOR_LABELS: Record<UpdateAuthor, string> = {
  owner: "我方",
  client: "客戶",
  system: "系統",
};

const AUTHOR_CHIP: Record<UpdateAuthor, { fg: string; bg: string }> = {
  owner: { fg: "#0f56a6", bg: "#e2effb" },
  client: { fg: "#8a6d00", bg: "#fff4d1" },
  system: { fg: "#6e6e73", bg: "#ececee" },
};

// YYYY.MM.DD HH:mm（照後台其他頁格式）
function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** P1：專案動態 feed（客戶留言／我方回覆／系統事件）＋回覆框（送出即通知客戶）。 */
export default function UpdatesPanel({ caseId, updates, hasClientEmail }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [body, setBody] = useState("");

  async function reply() {
    const text = body.trim();
    if (!text) {
      setError("請先填回覆內容");
      return;
    }
    if (text.length > BODY_MAX) {
      setError(`回覆內容最長 ${BODY_MAX} 字`);
      return;
    }
    if (busy) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ case_id: caseId, body: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        setError(data?.message || data?.error || "回覆失敗，請稍後再試");
        return;
      }
      setBody("");
      setNotice(
        data.emailed
          ? "已回覆，通知信已寄給客戶 ✅"
          : "已回覆 ✅（未寄信：客戶沒有 Email 或寄信未設定，內容已顯示在進度頁）"
      );
      router.refresh();
    } catch {
      setError("連線出了點問題，請稍後再試");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gt-admin-card">
      <h2 style={{ fontSize: 17, fontWeight: 700, color: "#1d1d1f", margin: "0 0 14px" }}>專案動態</h2>

      {/* 回覆框 */}
      <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          maxLength={BODY_MAX}
          style={{
            width: "100%",
            border: "1px solid rgba(0,0,0,.14)",
            borderRadius: 12,
            padding: "10px 13px",
            fontSize: 14,
            outline: "none",
            background: "#fff",
            color: "#1d1d1f",
            resize: "vertical",
            lineHeight: 1.6,
          }}
          placeholder="回覆客戶或記錄進度（會顯示在客戶進度頁）"
        />
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12.5, color: "#86868b" }}>
            {hasClientEmail ? "送出後會寄信通知客戶（含進度頁連結）。" : "此案件沒有客戶 Email，回覆只會顯示在進度頁、不會寄信。"}
          </span>
          <button
            type="button"
            onClick={reply}
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
              marginLeft: "auto",
            }}
          >
            {busy ? "送出中…" : "送出回覆"}
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            marginBottom: 12,
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
            marginBottom: 12,
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

      {/* 動態 feed（新→舊） */}
      {updates.length === 0 ? (
        <p style={{ fontSize: 13.5, color: "#86868b", margin: 0 }}>
          還沒有動態。簽約、付款、里程碑完成等系統事件與雙方留言都會顯示在這裡。
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {updates.map((u) => {
            const chip = AUTHOR_CHIP[u.author] ?? AUTHOR_CHIP.system;
            const isSystem = u.author === "system";
            return (
              <div
                key={u.id}
                style={{
                  border: "1px solid rgba(0,0,0,.08)",
                  borderRadius: 12,
                  padding: "10px 12px",
                  background: isSystem ? "#fafafa" : "#fff",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: isSystem ? 2 : 6 }}>
                  <span
                    style={{
                      color: chip.fg,
                      background: chip.bg,
                      borderRadius: 980,
                      padding: "2px 10px",
                      fontSize: 12,
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {AUTHOR_LABELS[u.author] ?? u.author}
                  </span>
                  <span style={{ fontSize: 12.5, color: "#86868b" }}>{formatDateTime(u.created_at)}</span>
                </div>
                <div
                  style={{
                    fontSize: isSystem ? 13 : 14,
                    color: isSystem ? "#6e6e73" : "#1d1d1f",
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.7,
                  }}
                >
                  {u.body}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
