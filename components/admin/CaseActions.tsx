"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { moneyTWD } from "@/lib/quote";
import { PAYMENT_KIND_LABELS, type Payment } from "@/lib/payment";
import type { Contract } from "@/lib/contract";

const BRAND_BLUE = "#1668c2";

type Props = {
  caseId: string;
  caseStatus: string;
  contract: Contract | null;
  payments: Payment[];
};

const primaryBtn: React.CSSProperties = {
  border: "none",
  background: BRAND_BLUE,
  color: "#fff",
  borderRadius: 980,
  padding: "10px 22px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};
const outlineBtn: React.CSSProperties = {
  border: `1px solid ${BRAND_BLUE}`,
  background: "#fff",
  color: BRAND_BLUE,
  borderRadius: 980,
  padding: "8px 18px",
  fontSize: 13.5,
  fontWeight: 500,
  cursor: "pointer",
};
const dangerBtn: React.CSSProperties = {
  border: "1px solid #f0c4c0",
  background: "#fff",
  color: "#c0392b",
  borderRadius: 980,
  padding: "8px 18px",
  fontSize: 13.5,
  fontWeight: 500,
  cursor: "pointer",
};

/** 案件操作：標記完工並請尾款／標記已收款（匯款）／作廢合約。 */
export default function CaseActions({ caseId, caseStatus, contract, payments }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const pendingPayments = payments.filter((p) => p.status === "pending");
  const hasPendingDeposit = pendingPayments.some((p) => p.kind === "deposit");
  const canComplete = caseStatus === "進行中";
  const canVoidContract = !!contract && contract.status !== "voided";

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

  async function complete() {
    const msg = hasPendingDeposit
      ? "訂金尚未付款，完工後訂金單將作廢、尾款以全額計，確定？"
      : "確定標記完工？系統將自動產生尾款請款單並寄給客戶。";
    if (!confirm(msg)) return;
    await call(async () => {
      const res = await fetch("/api/admin/cases/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: caseId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        setError(data?.message || data?.error || "完工失敗，請稍後再試");
        return;
      }
      if (data.already) {
        setNotice("這個案件先前已完工並產生過尾款單，不重複請款。");
      } else if (!data.paymentId) {
        setNotice("已標記完工 ✅（款項已付清或無關聯報價，未產生尾款單）");
      } else if (data.emailed === false) {
        setNotice("已標記完工並產生尾款單 ✅，但請款信未寄出——可到上方複製付款連結補寄。");
      } else {
        setNotice("已標記完工，尾款請款信已寄給客戶 ✅");
      }
    });
  }

  async function markPaid(p: Payment) {
    const label = `${PAYMENT_KIND_LABELS[p.kind] ?? p.kind} ${moneyTWD(p.amount)}（${p.payment_no ?? "—"}）`;
    if (!confirm(`確定標記 ${label} 已收款（匯款）？將自動觸發後續流程（開工／結案通知）。`)) return;
    await call(async () => {
      const res = await fetch("/api/admin/payments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id, action: "mark_paid" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        setError(data?.message || data?.error || "標記收款失敗，請稍後再試");
        return;
      }
      setNotice(data.transitioned ? "已標記收款 ✅（後續自動流程已觸發）" : "這筆款項先前已處理過，不重複執行。");
    });
  }

  async function voidTheContract() {
    if (!contract) return;
    if (!confirm(`確定作廢合約 ${contract.contract_no ?? ""}？作廢後客戶的簽署連結將失效，此動作無法復原。`)) return;
    await call(async () => {
      const res = await fetch("/api/admin/contracts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: contract.id, action: "void" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        setError(data?.message || data?.error || "作廢失敗，請稍後再試");
        return;
      }
      setNotice("合約已作廢。");
    });
  }

  const hasAnyAction = canComplete || pendingPayments.length > 0 || canVoidContract;

  return (
    <div className="gt-admin-card">
      <h2 style={{ fontSize: 17, fontWeight: 700, color: "#1d1d1f", margin: "0 0 14px" }}>操作</h2>

      {!hasAnyAction && (
        <p style={{ fontSize: 13.5, color: "#86868b", margin: 0 }}>目前沒有可執行的金流操作。</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {canComplete && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <button type="button" onClick={complete} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
              {busy ? "處理中…" : "標記完工並請尾款"}
            </button>
            <span style={{ fontSize: 12.5, color: "#86868b" }}>
              案件轉「已完成」，自動開尾款單（總價－實付訂金）並寄驗收請款信。
            </span>
          </div>
        )}

        {pendingPayments.map((p) => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => markPaid(p)}
              disabled={busy}
              style={{ ...outlineBtn, opacity: busy ? 0.6 : 1 }}
            >
              標記已收款（匯款）：{PAYMENT_KIND_LABELS[p.kind] ?? p.kind} {moneyTWD(p.amount)}
            </button>
            <span style={{ fontSize: 12.5, color: "#86868b" }}>{p.payment_no ?? ""}</span>
          </div>
        ))}

        {canVoidContract && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={voidTheContract}
              disabled={busy}
              style={{ ...dangerBtn, opacity: busy ? 0.6 : 1 }}
            >
              作廢合約
            </button>
            <span style={{ fontSize: 12.5, color: "#86868b" }}>{contract?.contract_no ?? ""}</span>
          </div>
        )}
      </div>

      {error && (
        <div
          style={{
            marginTop: 14,
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
            marginTop: 14,
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
  );
}
