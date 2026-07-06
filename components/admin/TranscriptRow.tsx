"use client";

import Link from "next/link";
import { useState } from "react";
import type { ChatLog } from "@/lib/adminChat";

const BRAND_BLUE = "#1668c2";
const GREEN = "#1f7a44";

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

/** 收合列上的聯絡摘要（姓名 · 電話 · LINE · Email）。 */
function contactLine(log: ChatLog): string {
  return [
    log.contact_name,
    log.contact_phone,
    log.contact_line ? `LINE ${log.contact_line}` : null,
    log.contact_email,
  ]
    .filter(Boolean)
    .join(" · ");
}

const contactPill: React.CSSProperties = {
  display: "inline-block",
  flexShrink: 0,
  fontSize: 11.5,
  fontWeight: 700,
  color: GREEN,
  background: "#dcf3e5",
  borderRadius: 980,
  padding: "2px 9px",
};

/** 一段 AI 客服對話：可摺疊；有留聯絡則加標記＋聯絡卡，並可一鍵「建立案件」（已帶入聯絡）。 */
export default function TranscriptRow({ log }: Props) {
  const [open, setOpen] = useState(false);

  const question = log.first_question?.trim() || "（無提問內容）";
  const hasContact = log.has_contact;
  const caseTitle = (log.summary || log.first_question || "").slice(0, 60);

  // /admin/cases 預填連結：帶 session / 標題 / 備註（摘要＋整段對話）/ 聯絡資訊
  const caseHref =
    `/admin/cases?new=1` +
    `&session=${encodeURIComponent(log.session_id)}` +
    `&title=${encodeURIComponent(caseTitle)}` +
    `&note=${encodeURIComponent((log.summary ? `需求摘要：${log.summary}\n\n` : "") + buildTranscript(log))}` +
    `&name=${encodeURIComponent(log.contact_name || "")}` +
    `&email=${encodeURIComponent(log.contact_email || "")}` +
    `&phone=${encodeURIComponent(log.contact_phone || "")}` +
    `&line=${encodeURIComponent(log.contact_line || "")}`;

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
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {hasContact && <span style={contactPill}>📇 已留聯絡</span>}
            <span
              style={{
                flex: 1,
                minWidth: 0,
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
          </span>
          <span style={{ display: "block", fontSize: 12.5, color: "#86868b", marginTop: 4 }}>
            {log.message_count} 則 · {formatDateTime(log.updated_at)}
            {log.user_ip ? ` · ${log.user_ip}` : ""}
          </span>
          {hasContact && contactLine(log) && (
            <span
              style={{
                display: "block",
                fontSize: 12.5,
                color: GREEN,
                fontWeight: 600,
                marginTop: 3,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              📇 {contactLine(log)}
            </span>
          )}
        </span>
      </button>

      {/* 展開內容 */}
      {open && (
        <div style={{ borderTop: "1px solid rgba(0,0,0,.07)" }}>
          {/* 聯絡資訊卡 */}
          {hasContact && (
            <div style={{ padding: "14px 22px", background: "#eefaf1", borderBottom: "1px solid rgba(0,0,0,.06)" }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: GREEN, letterSpacing: ".04em", marginBottom: 8 }}>
                📇 客人聯絡資訊（AI 從對話中辨識）
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 22px", fontSize: 14, color: "#1d1d1f" }}>
                {log.contact_name && (
                  <span>
                    <b>稱呼</b>：{log.contact_name}
                  </span>
                )}
                {log.contact_phone && (
                  <span>
                    <b>電話</b>：{log.contact_phone}
                  </span>
                )}
                {log.contact_line && (
                  <span>
                    <b>LINE</b>：{log.contact_line}
                  </span>
                )}
                {log.contact_email && (
                  <span>
                    <b>Email</b>：{log.contact_email}
                  </span>
                )}
              </div>
              {log.summary && (
                <div style={{ marginTop: 10, fontSize: 14, color: "#1d1d1f" }}>
                  <b>需求</b>：{log.summary}
                </div>
              )}
              {log.intent && <div style={{ marginTop: 4, fontSize: 13, color: "#6e6e73" }}>意向：{log.intent}</div>}
            </div>
          )}

          {/* 對話泡泡 */}
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
