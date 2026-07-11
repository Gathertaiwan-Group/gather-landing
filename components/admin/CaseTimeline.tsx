"use client";

import { useState } from "react";
import Link from "next/link";
import { moneyTWD, QUOTE_STATUS_LABELS, QUOTE_STATUS_COLORS, type Quote } from "@/lib/quote";
import { CONTRACT_STATUS_LABELS, CONTRACT_STATUS_COLORS, type Contract } from "@/lib/contract";
import {
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
  PAYMENT_KIND_LABELS,
  type Payment,
} from "@/lib/payment";

const BRAND_BLUE = "#1668c2";

type Props = {
  quote: Quote | null;
  contract: Contract | null;
  payments: Payment[];
};

const METHOD_LABELS: Record<string, string> = {
  pchomepay_credit: "信用卡（PChomePay）",
  pchomepay_atm: "ATM（PChomePay）",
  bank_transfer: "匯款",
  manual: "手動",
};

// YYYY.MM.DD HH:mm（照 QuoteEditor 格式）
function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 客戶端可讀取的站台網址（NEXT_PUBLIC 若沒被 inline 就退回 window.origin）。 */
function siteOrigin(): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

/** 報價狀態 chip（沿用 quotes 頁 fg/bg 藥丸樣式）。 */
function QuoteChip({ status }: { status: string }) {
  const c = QUOTE_STATUS_COLORS[status] ?? { fg: "#6e6e73", bg: "#ececee" };
  return (
    <span
      style={{
        color: c.fg,
        background: c.bg,
        borderRadius: 980,
        padding: "3px 12px",
        fontSize: 12.5,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {QUOTE_STATUS_LABELS[status] ?? status}
    </span>
  );
}

/** 公開連結列：readonly 網址 + 複製鈕（方便老闆補寄）。 */
function CopyLink({ url, label }: { url: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* 剪貼簿失敗就忽略 */
    }
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
      <span style={{ fontSize: 12, color: "#86868b", whiteSpace: "nowrap" }}>{label}</span>
      <input
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        style={{
          flex: 1,
          minWidth: 180,
          border: "1px solid rgba(0,0,0,.1)",
          borderRadius: 10,
          padding: "6px 10px",
          fontSize: 12.5,
          color: "#6e6e73",
          background: "#f5f5f7",
          outline: "none",
        }}
      />
      <button
        type="button"
        onClick={copy}
        style={{
          border: `1px solid ${BRAND_BLUE}`,
          background: "#fff",
          color: BRAND_BLUE,
          borderRadius: 980,
          padding: "5px 14px",
          fontSize: 12.5,
          fontWeight: 500,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {copied ? "已複製 ✅" : "複製"}
      </button>
    </div>
  );
}

/** timeline 單一節點外框（左側圓號＋直線）。 */
function Step({
  index,
  title,
  isLast,
  children,
}: {
  index: number;
  title: string;
  isLast?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", gap: 14 }}>
      {/* 左側：號碼圓點＋連接線 */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <span
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            background: "#e2effb",
            color: BRAND_BLUE,
            fontSize: 13,
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {index}
        </span>
        {!isLast && <span style={{ width: 2, flex: 1, background: "rgba(0,0,0,.08)", marginTop: 4 }} />}
      </div>
      {/* 右側：內容 */}
      <div style={{ flex: 1, minWidth: 0, paddingBottom: isLast ? 0 : 22 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#1d1d1f", marginBottom: 8 }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

const metaText: React.CSSProperties = { fontSize: 12.5, color: "#86868b" };
const emptyText: React.CSSProperties = { fontSize: 13.5, color: "#86868b" };

/** 案件金流 timeline：報價 → 合約 → 請款（各段編號／狀態 chip／金額／時間／公開連結）。 */
export default function CaseTimeline({ quote, contract, payments }: Props) {
  const origin = siteOrigin();

  return (
    <div className="gt-admin-card">
      <h2 style={{ fontSize: 17, fontWeight: 700, color: "#1d1d1f", margin: "0 0 18px" }}>金流進度</h2>

      {/* ① 報價 */}
      <Step index={1} title="報價">
        {quote ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <Link
                href={`/admin/quotes/${quote.id}`}
                style={{ fontSize: 14, fontWeight: 600, color: BRAND_BLUE, textDecoration: "none" }}
              >
                {quote.quote_no ?? "報價單"}
              </Link>
              <QuoteChip status={quote.status} />
              <span style={{ fontSize: 14, fontWeight: 700, color: "#1d1d1f", fontVariantNumeric: "tabular-nums" }}>
                {moneyTWD(quote.total)}
              </span>
            </div>
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 6, ...metaText }}>
              <span>寄出：{formatDateTime(quote.sent_at)}</span>
              <span>接受：{formatDateTime(quote.accepted_at)}</span>
            </div>
            {quote.public_token && <CopyLink url={`${origin}/quote/${quote.public_token}`} label="報價連結" />}
          </>
        ) : (
          <p style={{ ...emptyText, margin: 0 }}>尚未有關聯報價單。</p>
        )}
      </Step>

      {/* ② 合約 */}
      <Step index={2} title="合約">
        {contract ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#1d1d1f" }}>{contract.contract_no ?? "—"}</span>
              <span className={CONTRACT_STATUS_COLORS[contract.status]}>
                {CONTRACT_STATUS_LABELS[contract.status] ?? contract.status}
              </span>
            </div>
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 6, ...metaText }}>
              <span>寄出：{formatDateTime(contract.sent_at)}</span>
              <span>
                簽署：{formatDateTime(contract.signed_at)}
                {contract.signer_name ? `（${contract.signer_name}）` : ""}
              </span>
            </div>
            {contract.public_token && contract.status !== "voided" && (
              <CopyLink url={`${origin}/contract/${contract.public_token}`} label="合約連結" />
            )}
          </>
        ) : (
          <p style={{ ...emptyText, margin: 0 }}>尚未產生合約（客戶接受報價後會自動建立並寄出）。</p>
        )}
      </Step>

      {/* ③ 請款 */}
      <Step index={3} title="請款" isLast>
        {payments.length === 0 ? (
          <p style={{ ...emptyText, margin: 0 }}>尚未有請款單（合約簽署後會自動開出訂金單）。</p>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {payments.map((p) => (
              <div
                key={p.id}
                style={{ border: "1px solid rgba(0,0,0,.08)", borderRadius: 14, padding: "12px 14px" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: BRAND_BLUE }}>
                    {PAYMENT_KIND_LABELS[p.kind] ?? p.kind}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#1d1d1f" }}>{p.payment_no ?? "—"}</span>
                  <span className={PAYMENT_STATUS_COLORS[p.status]}>
                    {PAYMENT_STATUS_LABELS[p.status] ?? p.status}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#1d1d1f", fontVariantNumeric: "tabular-nums" }}>
                    {moneyTWD(p.amount)}
                  </span>
                </div>
                {p.title && <div style={{ fontSize: 13, color: "#6e6e73", marginTop: 5 }}>{p.title}</div>}
                <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 6, ...metaText }}>
                  <span>建立：{formatDateTime(p.created_at)}</span>
                  {p.status === "paid" && (
                    <span>
                      付款：{formatDateTime(p.paid_at)}
                      {p.method ? `（${METHOD_LABELS[p.method] ?? p.method}）` : ""}
                    </span>
                  )}
                </div>
                {p.atm_v_account && (
                  <div style={{ marginTop: 6, ...metaText }}>
                    ATM 取號：{p.atm_bank_code ?? "—"} / {p.atm_v_account}
                    {p.atm_expire_date ? `（繳費期限 ${p.atm_expire_date}）` : ""}
                  </div>
                )}
                {p.public_token && p.status === "pending" && (
                  <CopyLink url={`${origin}/pay/${p.public_token}`} label="付款連結" />
                )}
              </div>
            ))}
          </div>
        )}
      </Step>
    </div>
  );
}
