"use client";

import Link from "next/link";
import { useState } from "react";
import type { ChatLog } from "@/lib/adminChat";

const BRAND_BLUE = "#1668c2";

type Props = { log: ChatLog };

// YYYY.MM.DD HH:mm
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 把整段對話組成純文字（帶入案件備註用；限長 ~1500 字）。 */
function buildTranscript(log: ChatLog): string {
  const text = log.messages
    .map((m) => `${m.role === "user" ? "使用者" : "AI"}：${m.text}`)
    .join("\n");
  return text.length > 1500 ? text.slice(0, 1500) + "…" : text;
}

/** 一段 AI 客服對話：可摺疊，展開顯示聊天泡泡，並可一鍵「建立案件」。 */
export default function TranscriptRow({ log }: Props) {
  const [open, setOpen] = useState(false);

  const question = log.first_question?.trim() || "（無提問內容）";

  // /admin/cases 預填連結：帶 session / 標題（前 60 字）/ 備註（整段對話）
  const caseHref =
    `/admin/cases?new=1` +
    `&session=${encodeURIComponent(log.session_id)}` +
    `&title=${encodeURIComponent((log.first_question || "").slice(0, 60))}` +
    `&note=${encodeURIComponent(buildTranscript(log))}`;

  return (
    <div className="gt-admin-card" style={{ padding: 0, overflow: "hidden", marginBottom: 14 }}>
      {/* 摺疊列 */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          padding: "18px 22px",
          background: "transparent",
          border: "none",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <span style={{ fontSize: 15, color: "#86868b", marginTop: 2, flexShrink: 0 }}>{open ? "▾" : "▸"}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: "block",
              fontSize: 15.5,
              fontWeight: 600,
              color: "#1d1d1f",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {question}
          </span>
          <span style={{ display: "block", fontSize: 12.5, color: "#86868b", marginTop: 4 }}>
            {log.message_count} 則 · {formatDateTime(log.updated_at)}
            {log.user_ip ? ` · ${log.user_ip}` : ""}
          </span>
        </span>
      </button>

      {/* 展開內容 */}
      {open && (
        <div style={{ borderTop: "1px solid rgba(0,0,0,.07)" }}>
          <div style={{ padding: "16px 22px", background: "#f5f5f7" }}>
            {log.messages.map((m, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    maxWidth: "82%",
                    padding: "10px 14px",
                    borderRadius: 14,
                    fontSize: 14.5,
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                    background: m.role === "user" ? BRAND_BLUE : "#fff",
                    color: m.role === "user" ? "#fff" : "#1d1d1f",
                    boxShadow: m.role === "user" ? "none" : "0 2px 10px rgba(20,40,80,.06)",
                  }}
                >
                  {m.text}
                </div>
              </div>
            ))}
          </div>

          {/* 動作列 */}
          <div style={{ padding: "12px 22px", display: "flex", justifyContent: "flex-end" }}>
            <Link
              href={caseHref}
              style={{
                border: `1px solid ${BRAND_BLUE}`,
                color: BRAND_BLUE,
                background: "#fff",
                borderRadius: 980,
                padding: "7px 16px",
                fontSize: 13.5,
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              建立案件
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
