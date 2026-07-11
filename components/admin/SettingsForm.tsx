"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CompanyProfile } from "@/lib/settings";

const BRAND_BLUE = "#1668c2";

type Props = {
  initial: {
    company_profile: CompanyProfile;
    deposit_ratio: number; // 0~1
    contract_template: string;
  };
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

/** 合約模板 placeholders 對照說明（renderContractMd 會替換的 13 個變數）。 */
const PLACEHOLDERS: Array<[string, string]> = [
  ["{{contract_no}}", "合約編號（系統自動產生）"],
  ["{{date}}", "簽立日期（產約當日）"],
  ["{{client_name}}", "客戶名稱（甲方）"],
  ["{{company_name}}", "公司名稱（乙方，取自公司資訊）"],
  ["{{quote_no}}", "報價單編號"],
  ["{{quote_title}}", "報價標題（首項摘要）"],
  ["{{line_items}}", "報價項目明細表格"],
  ["{{subtotal}}", "小計金額"],
  ["{{tax}}", "稅額"],
  ["{{total}}", "總價"],
  ["{{deposit_amount}}", "訂金金額"],
  ["{{final_amount}}", "尾款金額"],
  ["{{deposit_ratio_percent}}", "訂金比例（純數字，如 50）"],
];

/** 系統設定表單：公司資訊／訂金比例（%）／合約模板。 */
export default function SettingsForm({ initial }: Props) {
  const router = useRouter();

  const [name, setName] = useState(initial.company_profile.name ?? "");
  const [taxId, setTaxId] = useState(initial.company_profile.taxId ?? "");
  const [email, setEmail] = useState(initial.company_profile.email ?? "");
  const [phone, setPhone] = useState(initial.company_profile.phone ?? "");
  const [bankInfo, setBankInfo] = useState(initial.company_profile.bankInfo ?? "");
  // 顯示成 %（存 DB 時 /100 回 0~1）
  const [ratioPct, setRatioPct] = useState(String(Math.round((Number(initial.deposit_ratio) || 0) * 100)));
  const [template, setTemplate] = useState(initial.contract_template ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function save() {
    if (saving) return;
    setError(null);
    setNotice(null);

    if (!name.trim()) {
      setError("公司名稱為必填。");
      return;
    }
    const pct = Number(ratioPct);
    if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) {
      setError("訂金比例需介於 1 ～ 99 之間（%）。");
      return;
    }
    if (!template.trim()) {
      setError("合約模板不可為空。");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_profile: {
            name: name.trim(),
            taxId: taxId.trim(),
            email: email.trim(),
            phone: phone.trim(),
            bankInfo: bankInfo.trim(),
          },
          deposit_ratio: pct / 100,
          contract_template: template,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        setError(data?.message || data?.error || "儲存失敗，請稍後再試");
        return;
      }
      setNotice("設定已儲存 ✅（之後新產生的合約／訂金單都會套用）");
      router.refresh();
    } catch {
      setError("連線出了點問題，請稍後再試");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 20, maxWidth: 900 }}>
      {/* 公司資訊 */}
      <div className="gt-admin-card">
        <h2 style={{ fontSize: 17, fontWeight: 700, color: "#1d1d1f", margin: "0 0 6px" }}>公司資訊</h2>
        <p style={{ fontSize: 12.5, color: "#86868b", margin: "0 0 14px" }}>用於合約抬頭（乙方）與對外文件署名。</p>
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={labelStyle}>公司名稱 *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} style={fieldStyle} placeholder="給樂數位" />
            </div>
            <div>
              <label style={labelStyle}>統一編號</label>
              <input value={taxId} onChange={(e) => setTaxId(e.target.value)} style={fieldStyle} placeholder="選填" />
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
          <div>
            <label style={labelStyle}>匯款帳戶資訊</label>
            <textarea
              value={bankInfo}
              onChange={(e) => setBankInfo(e.target.value)}
              rows={3}
              style={{ ...fieldStyle, resize: "vertical", lineHeight: 1.6 }}
              placeholder={"例：\n銀行：822 中國信託\n帳號：0000-0000-0000\n戶名：給樂數位"}
            />
          </div>
        </div>
      </div>

      {/* 訂金比例 */}
      <div className="gt-admin-card">
        <h2 style={{ fontSize: 17, fontWeight: 700, color: "#1d1d1f", margin: "0 0 6px" }}>訂金比例</h2>
        <p style={{ fontSize: 12.5, color: "#86868b", margin: "0 0 14px" }}>
          合約簽署後自動開出的訂金單金額＝總價 × 此比例；尾款＝總價－實付訂金。
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            value={ratioPct}
            onChange={(e) => setRatioPct(e.target.value)}
            inputMode="numeric"
            style={{ ...fieldStyle, width: 120, textAlign: "right" }}
            aria-label="訂金比例（百分比）"
          />
          <span style={{ fontSize: 15, fontWeight: 600, color: "#1d1d1f" }}>%</span>
          <span style={{ fontSize: 12.5, color: "#86868b" }}>（1 ～ 99；例：30 代表收 30% 訂金）</span>
        </div>
      </div>

      {/* 合約模板 */}
      <div className="gt-admin-card">
        <h2 style={{ fontSize: 17, fontWeight: 700, color: "#1d1d1f", margin: "0 0 6px" }}>合約模板</h2>
        <p style={{ fontSize: 12.5, color: "#86868b", margin: "0 0 14px" }}>
          Markdown 格式；客戶接受報價後，系統以此模板自動產生合約並寄出。下方變數會在產約時自動代入。
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
          <textarea
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            rows={22}
            style={{
              ...fieldStyle,
              flex: "1 1 380px",
              minWidth: 0,
              width: "auto",
              resize: "vertical",
              lineHeight: 1.7,
              fontSize: 13.5,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
          />
          <div
            style={{
              flex: "0 1 260px",
              border: "1px solid rgba(0,0,0,.08)",
              borderRadius: 12,
              padding: "12px 14px",
              background: "#f5f5f7",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1d1d1f", marginBottom: 8 }}>可用變數</div>
            <dl style={{ margin: 0, display: "grid", gap: 7 }}>
              {PLACEHOLDERS.map(([ph, desc]) => (
                <div key={ph}>
                  <dt
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: BRAND_BLUE,
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    }}
                  >
                    {ph}
                  </dt>
                  <dd style={{ margin: 0, fontSize: 11.5, color: "#6e6e73" }}>{desc}</dd>
                </div>
              ))}
            </dl>
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
      <div style={{ display: "flex", justifyContent: "flex-end", paddingBottom: 8 }}>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          style={{
            border: "none",
            background: BRAND_BLUE,
            color: "#fff",
            borderRadius: 980,
            padding: "10px 24px",
            fontSize: 14,
            fontWeight: 600,
            cursor: saving ? "default" : "pointer",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "儲存中…" : "儲存設定"}
        </button>
      </div>
    </div>
  );
}
