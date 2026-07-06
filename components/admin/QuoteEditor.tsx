"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { moneyTWD, computeTotals, QUOTE_STATUS_LABELS, QUOTE_STATUS_COLORS, type Quote } from "@/lib/quote";

const BRAND_BLUE = "#1668c2";

type EditItem = { description: string; qty: string; unit_price: string };

type Props = {
  quote: Quote;
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

// YYYY.MM.DD HH:mm
function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function StatusChip({ status }: { status: string }) {
  const c = QUOTE_STATUS_COLORS[status] ?? { fg: "#6e6e73", bg: "#ececee" };
  return (
    <span
      style={{
        color: c.fg,
        background: c.bg,
        borderRadius: 980,
        padding: "3px 12px",
        fontSize: 13,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {QUOTE_STATUS_LABELS[status] ?? status}
    </span>
  );
}

/** 客戶端可讀取的站台網址（NEXT_PUBLIC 若沒被 inline 就退回 window.origin）。 */
function siteOrigin(): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export default function QuoteEditor({ quote }: Props) {
  const router = useRouter();

  const [clientName, setClientName] = useState(quote.client_name ?? "");
  const [email, setEmail] = useState(quote.contact_email ?? "");
  const [phone, setPhone] = useState(quote.contact_phone ?? "");
  const [line, setLine] = useState(quote.contact_line ?? "");
  const [notes, setNotes] = useState(quote.notes ?? "");
  const [validDays, setValidDays] = useState(quote.valid_days != null ? String(quote.valid_days) : "14");
  const [items, setItems] = useState<EditItem[]>(() =>
    (quote.line_items ?? []).map((it) => ({
      description: it.description ?? "",
      qty: String(it.qty ?? 0),
      unit_price: String(it.unit_price ?? 0),
    }))
  );
  // 現有報價已含稅（tax>0）→ 預設勾選加 5%
  const [tax5, setTax5] = useState<boolean>(() => (quote.tax ?? 0) > 0);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sentLink, setSentLink] = useState<string | null>(
    quote.public_token ? `${siteOrigin()}/quote/${quote.public_token}` : null
  );

  const taxRate = tax5 ? 0.05 : 0;

  // 即時試算（用數字化後的 items）
  const totals = useMemo(() => {
    const numeric = items.map((it) => ({
      description: it.description,
      qty: Number(it.qty) || 0,
      unit_price: Number(it.unit_price) || 0,
      amount: (Number(it.qty) || 0) * (Number(it.unit_price) || 0),
    }));
    return computeTotals(numeric, taxRate);
  }, [items, taxRate]);

  function updateItem(idx: number, key: keyof EditItem, value: string) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [key]: value } : it)));
  }
  function addItem() {
    setItems((prev) => [...prev, { description: "", qty: "1", unit_price: "0" }]);
  }
  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  // 送 PATCH 用的 payload（把編輯欄位打包）
  function buildPatchPayload() {
    return {
      id: quote.id,
      client_name: clientName.trim(),
      contact_email: email.trim(),
      contact_phone: phone.trim(),
      contact_line: line.trim(),
      notes: notes.trim(),
      valid_days: Number(validDays) || null,
      tax_rate: taxRate,
      line_items: items
        .map((it) => ({
          description: it.description.trim(),
          qty: Number(it.qty) || 0,
          unit_price: Number(it.unit_price) || 0,
        }))
        .filter((it) => it.description),
    };
  }

  async function patchQuote(): Promise<boolean> {
    const res = await fetch("/api/admin/quotes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPatchPayload()),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      setError(data?.message || data?.error || "儲存失敗，請稍後再試");
      return false;
    }
    return true;
  }

  async function saveDraft() {
    if (submitting) return;
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      const ok = await patchQuote();
      if (ok) {
        setNotice("已儲存 ✅");
        router.refresh();
      }
    } catch {
      setError("連線出了點問題，請稍後再試");
    } finally {
      setSubmitting(false);
    }
  }

  async function approveAndSend() {
    if (submitting) return;
    setError(null);
    setNotice(null);
    if (!email.trim()) {
      setError("請先填客戶 Email 再寄出");
      return;
    }
    setSubmitting(true);
    try {
      // 1) 先 PATCH 存下目前編輯內容
      const saved = await patchQuote();
      if (!saved) return;
      // 2) 再核准並寄出
      const res = await fetch("/api/admin/quotes/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: quote.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        setError(data?.message || data?.error || "寄出失敗，請稍後再試");
        return;
      }
      const link = data.token ? `${siteOrigin()}/quote/${data.token}` : sentLink;
      setSentLink(link);
      if (data.emailed === false) {
        setNotice("已標記寄出，但 Email 未發送（RESEND 未設定）");
      } else {
        setNotice("已寄出 ✅");
      }
      router.refresh();
    } catch {
      setError("連線出了點問題，請稍後再試");
    } finally {
      setSubmitting(false);
    }
  }

  async function remove() {
    if (submitting) return;
    if (!confirm("確定要刪除這張報價單嗎？此動作無法復原。")) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/quotes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: quote.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        setError(data?.message || data?.error || "刪除失敗，請稍後再試");
        setSubmitting(false);
        return;
      }
      router.replace("/admin/quotes");
    } catch {
      setError("連線出了點問題，請稍後再試");
      setSubmitting(false);
    }
  }

  async function copyLink() {
    if (!sentLink) return;
    try {
      await navigator.clipboard.writeText(sentLink);
      setNotice("已複製連結 ✅");
    } catch {
      /* 剪貼簿失敗就忽略 */
    }
  }

  const smallField: React.CSSProperties = { ...fieldStyle, padding: "8px 10px", textAlign: "right" };

  return (
    <div style={{ display: "grid", gap: 20, maxWidth: 860 }}>
      {/* 標頭：編號 + 狀態 */}
      <div className="gt-admin-card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1d1d1f", margin: 0 }}>{quote.quote_no ?? "報價單"}</h1>
            <StatusChip status={quote.status} />
            {quote.created_by === "ai" && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: BRAND_BLUE,
                  background: "#e2effb",
                  borderRadius: 6,
                  padding: "2px 7px",
                  letterSpacing: ".04em",
                }}
              >
                AI 草稿
              </span>
            )}
          </div>
        </div>

        {/* 公開連結 + 時間戳（已寄出後才有） */}
        {sentLink && (
          <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
            <div>
              <label style={labelStyle}>公開報價連結（給客人）</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input readOnly value={sentLink} style={{ ...fieldStyle, flex: 1, minWidth: 200, background: "#f5f5f7" }} />
                <button
                  type="button"
                  onClick={copyLink}
                  style={{
                    border: `1px solid ${BRAND_BLUE}`,
                    background: "#fff",
                    color: BRAND_BLUE,
                    borderRadius: 980,
                    padding: "0 18px",
                    fontSize: 13.5,
                    fontWeight: 500,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  複製
                </button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 22, flexWrap: "wrap", fontSize: 12.5, color: "#86868b" }}>
              <span>寄出：{formatDateTime(quote.sent_at)}</span>
              <span>已讀：{formatDateTime(quote.viewed_at)}</span>
              <span>接受：{formatDateTime(quote.accepted_at)}</span>
            </div>
          </div>
        )}
      </div>

      {/* 品項編輯 */}
      <div className="gt-admin-card">
        <h2 style={{ fontSize: 17, fontWeight: 700, color: "#1d1d1f", margin: "0 0 14px" }}>報價項目</h2>
        <div className="gt-admin-table-wrap">
          <table className="gt-admin-table" style={{ minWidth: 620 }}>
            <thead>
              <tr>
                <th>項目說明</th>
                <th style={{ width: 84 }}>數量</th>
                <th style={{ width: 130 }}>單價</th>
                <th style={{ width: 130, textAlign: "right" }}>小計</th>
                <th style={{ width: 60 }} />
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ color: "#86868b", padding: "20px 14px", textAlign: "center" }}>
                    還沒有項目，點下方「新增項目」加一列。
                  </td>
                </tr>
              ) : (
                items.map((it, idx) => {
                  const sub = (Number(it.qty) || 0) * (Number(it.unit_price) || 0);
                  return (
                    <tr key={idx}>
                      <td>
                        <input
                          value={it.description}
                          onChange={(e) => updateItem(idx, "description", e.target.value)}
                          style={{ ...fieldStyle, padding: "8px 10px" }}
                          placeholder="例：品牌形象官網建置"
                        />
                      </td>
                      <td>
                        <input
                          value={it.qty}
                          onChange={(e) => updateItem(idx, "qty", e.target.value)}
                          inputMode="numeric"
                          style={smallField}
                        />
                      </td>
                      <td>
                        <input
                          value={it.unit_price}
                          onChange={(e) => updateItem(idx, "unit_price", e.target.value)}
                          inputMode="numeric"
                          style={smallField}
                        />
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          whiteSpace: "nowrap",
                          color: "#1d1d1f",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {moneyTWD(sub)}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          aria-label="刪除列"
                          style={{
                            border: "1px solid #f0c4c0",
                            background: "#fff",
                            color: "#c0392b",
                            borderRadius: 980,
                            padding: "5px 12px",
                            fontSize: 12.5,
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          刪除
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={addItem}
            style={{
              border: `1px dashed ${BRAND_BLUE}`,
              background: "#fff",
              color: BRAND_BLUE,
              borderRadius: 12,
              padding: "9px 16px",
              fontSize: 13.5,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            ＋ 新增項目
          </button>
        </div>

        {/* 稅 + 合計 */}
        <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}>
          <div style={{ width: "100%", maxWidth: 300, display: "grid", gap: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: "#6e6e73", cursor: "pointer" }}>
              <input type="checkbox" checked={tax5} onChange={(e) => setTax5(e.target.checked)} />
              加 5% 營業稅
            </label>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#6e6e73" }}>
              <span>小計</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{moneyTWD(totals.subtotal)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#6e6e73" }}>
              <span>營業稅（{tax5 ? "5%" : "0%"}）</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{moneyTWD(totals.tax)}</span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 17,
                fontWeight: 700,
                color: "#1d1d1f",
                borderTop: "1px solid rgba(0,0,0,.08)",
                paddingTop: 8,
              }}
            >
              <span>總計</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{moneyTWD(totals.total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 客戶 / 聯絡資訊 */}
      <div className="gt-admin-card">
        <h2 style={{ fontSize: 17, fontWeight: 700, color: "#1d1d1f", margin: "0 0 14px" }}>客戶資訊</h2>
        <div style={{ display: "grid", gap: 16 }}>
          <div>
            <label style={labelStyle}>客戶</label>
            <input value={clientName} onChange={(e) => setClientName(e.target.value)} style={fieldStyle} placeholder="客戶 / 公司名稱" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={labelStyle}>Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} style={fieldStyle} placeholder="寄報價用" />
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
              <label style={labelStyle}>有效天數</label>
              <input
                value={validDays}
                onChange={(e) => setValidDays(e.target.value)}
                inputMode="numeric"
                style={fieldStyle}
                placeholder="14"
              />
            </div>
          </div>
          <div>
            <label style={labelStyle}>備註</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              style={{ ...fieldStyle, resize: "vertical", lineHeight: 1.6 }}
              placeholder="範圍假設、需再確認事項等"
            />
          </div>
        </div>
      </div>

      {/* 訊息列 */}
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
      {notice && !error && (
        <div
          style={{
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

      {/* 動作列 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          paddingBottom: 8,
        }}
      >
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

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={saveDraft}
            disabled={submitting}
            style={{
              border: "1px solid rgba(0,0,0,.14)",
              background: "#fff",
              color: "#1d1d1f",
              borderRadius: 980,
              padding: "10px 20px",
              fontSize: 14,
              fontWeight: 500,
              cursor: submitting ? "default" : "pointer",
              opacity: submitting ? 0.5 : 1,
            }}
          >
            {submitting ? "處理中…" : "儲存草稿"}
          </button>
          <button
            type="button"
            onClick={approveAndSend}
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
            {submitting ? "處理中…" : "核准並寄出"}
          </button>
        </div>
      </div>
    </div>
  );
}
