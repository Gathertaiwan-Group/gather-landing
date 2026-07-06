"use client";

import { useState, type CSSProperties } from "react";
import { trackEvent } from "@/lib/analytics";

/* ============================================================
   給樂數位 Gather 官網 — 聯絡表單。
   取代原本的官方 LINE CTA;送出後 POST /api/contact
   (寫入 Supabase 並由後端另行寄信,非本元件負責)。
   視覺沿用全站 inline style 慣例:品牌藍 #1668c2、
   輸入框 border rgba(0,0,0,.14)/radius 12、pill 送出鈕。
   ============================================================ */

const BRAND_BLUE = "#1668c2";
const BRAND_BLUE_DARK = "#0f56a6";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 500,
  color: "#6e6e73",
  marginBottom: 8,
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid rgba(0,0,0,.14)",
  borderRadius: 12,
  padding: "12px 16px",
  fontSize: 15,
  lineHeight: 1.5,
  color: "#1d1d1f",
  background: "#fff",
  outline: "none",
  fontFamily: "inherit",
};

const fieldWrapStyle: CSSProperties = { marginBottom: 18, textAlign: "left" };

const onFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
  e.currentTarget.style.borderColor = BRAND_BLUE;
};
const onBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
  e.currentTarget.style.borderColor = "rgba(0,0,0,.14)";
};

const onPrimaryEnter = (e: React.MouseEvent<HTMLElement>) => {
  e.currentTarget.style.background = BRAND_BLUE_DARK;
};
const onPrimaryLeave = (e: React.MouseEvent<HTMLElement>) => {
  e.currentTarget.style.background = BRAND_BLUE;
};

export default function ContactForm({ compact }: { compact?: boolean } = {}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const canSubmit =
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    message.trim().length > 0 &&
    !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !email.trim() || !message.trim()) {
      setError("請填寫姓名、Email 與需求訊息。");
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      setError("請輸入正確的 Email 格式。");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          message: message.trim(),
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        trackEvent("contact_submit", { has_phone: !!phone.trim() });
        setDone(true);
      } else {
        setError(data?.message || "送出失敗,請稍後再試。");
      }
    } catch {
      setError("送出失敗,請稍後再試。");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div
        style={{
          maxWidth: 460,
          margin: "0 auto",
          background: "#f5f5f7",
          borderRadius: 24,
          padding: "40px 32px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 40, lineHeight: 1, marginBottom: 16 }}>🙌</div>
        <h3
          style={{
            margin: "0 0 10px",
            fontWeight: 700,
            fontSize: 22,
            letterSpacing: "-.015em",
            color: "#1d1d1f",
          }}
        >
          收到了!我們會盡快與您聯繫
        </h3>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: "#6e6e73" }}>
          感謝您的來訊,給樂數位團隊將於一個工作日內回覆您。
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      style={{
        maxWidth: 460,
        margin: "0 auto",
        textAlign: "left",
      }}
    >
      <div style={fieldWrapStyle}>
        <label htmlFor="cf-name" style={labelStyle}>
          姓名 <span style={{ color: BRAND_BLUE }}>*</span>
        </label>
        <input
          id="cf-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder="您的稱呼"
          autoComplete="name"
          style={inputStyle}
        />
      </div>

      <div style={fieldWrapStyle}>
        <label htmlFor="cf-email" style={labelStyle}>
          Email <span style={{ color: BRAND_BLUE }}>*</span>
        </label>
        <input
          id="cf-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder="you@example.com"
          autoComplete="email"
          style={inputStyle}
        />
      </div>

      <div style={fieldWrapStyle}>
        <label htmlFor="cf-phone" style={labelStyle}>
          電話
        </label>
        <input
          id="cf-phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder="選填,方便我們電話聯繫"
          autoComplete="tel"
          style={inputStyle}
        />
      </div>

      <div style={{ ...fieldWrapStyle, marginBottom: 20 }}>
        <label htmlFor="cf-message" style={labelStyle}>
          需求訊息 <span style={{ color: BRAND_BLUE }}>*</span>
        </label>
        <textarea
          id="cf-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder="簡單描述您的需求或想法,例如:全新官網、系統整合、既有網站優化…"
          rows={compact ? 3 : 5}
          style={{ ...inputStyle, resize: "vertical", minHeight: compact ? 84 : 120 }}
        />
      </div>

      {error && (
        <div
          role="alert"
          style={{
            margin: "0 0 16px",
            fontSize: 14,
            lineHeight: 1.6,
            color: "#c0392b",
          }}
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        onMouseEnter={onPrimaryEnter}
        onMouseLeave={onPrimaryLeave}
        style={{
          width: "100%",
          border: "none",
          fontSize: 16,
          fontWeight: 500,
          color: "#fff",
          background: BRAND_BLUE,
          padding: "14px 30px",
          borderRadius: 980,
          cursor: canSubmit ? "pointer" : "default",
          opacity: canSubmit ? 1 : 0.5,
          transition: "background .2s ease, opacity .2s ease",
        }}
      >
        {submitting ? "送出中…" : "送出需求"}
      </button>
    </form>
  );
}
