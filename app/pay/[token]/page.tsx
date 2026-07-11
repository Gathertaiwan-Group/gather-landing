import { notFound } from "next/navigation";
import StatusPoller from "@/components/pay/StatusPoller";
import {
  getPaymentByToken,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
  PAYMENT_KIND_LABELS,
} from "@/lib/payment";
import { moneyTWD } from "@/lib/quote";
import { createAdminSupabase } from "@/lib/supabase";

// 公開付款頁：以 service_role 的 server helper 讀取（RLS 保持鎖住）。
export const dynamic = "force-dynamic";
export const metadata = {
  title: "線上付款 — 給樂數位 Gather",
  robots: { index: false, follow: false },
};

const CONTACT_URL = "https://gathertaiwan.com/#contact";

/** 付款方式顯示名稱。 */
const METHOD_LABELS: Record<string, string> = {
  pchomepay_credit: "信用卡（PChomePay）",
  pchomepay_atm: "ATM 轉帳（PChomePay）",
  bank_transfer: "銀行匯款",
  manual: "手動登錄",
};

/** ISO 字串 → YYYY.MM.DD（台北時區）；無值回空字串。 */
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const t = new Date(d.getTime() + 8 * 3600000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}.${p(t.getUTCMonth() + 1)}.${p(t.getUTCDate())}`;
}

/**
 * failed 款項的作廢原因（payments.raw_response.voided_reason）。
 * Payment 型別未含 raw_response，這裡對單筆做最小查詢。
 */
async function getVoidedReason(paymentId: string): Promise<string | null> {
  const supabase = createAdminSupabase();
  if (!supabase) return null;
  try {
    const { data } = await supabase.from("payments").select("raw_response").eq("id", paymentId).maybeSingle();
    const raw = data?.raw_response;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const reason = (raw as Record<string, unknown>).voided_reason;
      return reason != null && String(reason) ? String(reason) : null;
    }
    return null;
  } catch {
    return null;
  }
}

export default async function PayPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams?: { done?: string };
}) {
  const payment = await getPaymentByToken(params.token);
  if (!payment) notFound();

  const done = searchParams?.done === "1";
  const pending = payment.status === "pending";
  const paid = payment.status === "paid";

  // failed：區分「被新請款單取代」與一般失效。
  let voidedReason: string | null = null;
  if (payment.status === "failed") {
    voidedReason = await getVoidedReason(payment.id);
  }

  return (
    <main className="gt-quote-page">
      <div className="gt-quote-card">
        {/* Header */}
        <div className="gt-quote-header">
          <div className="gt-quote-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="給樂數位 Gather" width={30} height={30} className="gt-quote-logo" />
            <span className="gt-quote-brandname">給樂數位 Gather</span>
          </div>
          <div className="gt-quote-meta">
            <div className="gt-quote-meta-label">請款單編號</div>
            <div className="gt-quote-meta-value">{payment.payment_no ?? "—"}</div>
          </div>
        </div>

        {/* 款項 / 類型 / 狀態 */}
        <div className="gt-quote-info">
          <div className="gt-quote-info-row">
            <span className="gt-quote-info-k">款項</span>
            <span className="gt-quote-info-v">{payment.title ?? PAYMENT_KIND_LABELS[payment.kind]}</span>
          </div>
          <div className="gt-quote-info-row">
            <span className="gt-quote-info-k">類型</span>
            <span className="gt-quote-info-v">{PAYMENT_KIND_LABELS[payment.kind]}</span>
          </div>
          {payment.created_at && (
            <div className="gt-quote-info-row">
              <span className="gt-quote-info-k">日期</span>
              <span className="gt-quote-info-v">{fmtDate(payment.created_at)}</span>
            </div>
          )}
          <div className="gt-quote-info-row">
            <span className="gt-quote-info-k">狀態</span>
            <span className={PAYMENT_STATUS_COLORS[payment.status]}>{PAYMENT_STATUS_LABELS[payment.status]}</span>
          </div>
        </div>

        {/* 金額 */}
        <div className="gt-pay-amountbox">
          <div className="gt-pay-amount-label">應付金額</div>
          <div className="gt-pay-amount">{moneyTWD(payment.amount)}</div>
        </div>

        {/* 返回頁處理中 banner（仍 pending 才輪詢） */}
        {done && pending && (
          <>
            <div className="gt-quote-banner gt-pay-banner-processing" role="status" style={{ marginTop: 14 }}>
              付款處理中，完成後會寄通知給您。此頁會自動更新付款狀態。
            </div>
            <StatusPoller />
          </>
        )}

        {/* 動作區 */}
        <div className="gt-quote-actions">
          {paid ? (
            <>
              <div className="gt-quote-banner gt-quote-banner-ok" role="status">
                ✅ 已{payment.paid_at ? `於 ${fmtDate(payment.paid_at)} ` : ""}完成付款，感謝您！
              </div>
              {payment.method && METHOD_LABELS[payment.method] && (
                <p className="gt-pay-note">付款方式：{METHOD_LABELS[payment.method]}</p>
              )}
            </>
          ) : pending ? (
            <>
              {payment.atm_v_account && (
                <div className="gt-pay-atm" style={{ width: "100%" }}>
                  <p className="gt-pay-atm-title">ATM 繳費資訊（已為您取號）</p>
                  {payment.atm_bank_code && (
                    <div className="gt-pay-atm-row">
                      <span className="gt-pay-atm-k">銀行代碼</span>
                      <span className="gt-pay-atm-v">{payment.atm_bank_code}</span>
                    </div>
                  )}
                  <div className="gt-pay-atm-row">
                    <span className="gt-pay-atm-k">虛擬帳號</span>
                    <span className="gt-pay-atm-v">{payment.atm_v_account}</span>
                  </div>
                  {payment.atm_expire_date && (
                    <div className="gt-pay-atm-row">
                      <span className="gt-pay-atm-k">繳費期限</span>
                      <span className="gt-pay-atm-v">{payment.atm_expire_date}</span>
                    </div>
                  )}
                  <p className="gt-pay-note" style={{ textAlign: "left", marginTop: 8 }}>
                    完成轉帳後系統會自動入帳；您也可以改用下方按鈕以其他方式付款。
                  </p>
                </div>
              )}
              <form method="POST" action="/api/pay/checkout">
                <input type="hidden" name="token" value={params.token} />
                <button type="submit" className="gt-quote-accept">
                  前往付款
                </button>
              </form>
              <p className="gt-pay-note">將導向 PChomePay 安全付款頁面，支援信用卡／ATM 轉帳。</p>
              <a className="gt-quote-link" href={CONTACT_URL}>
                有問題？聯絡我們
              </a>
            </>
          ) : payment.status === "failed" ? (
            <>
              <div className="gt-quote-banner gt-quote-banner-muted">
                {voidedReason === "final_created"
                  ? "此筆請款已由新的請款單取代，請使用最新的付款連結。"
                  : "此付款連結已失效，請聯絡我們。"}
              </div>
              <a className="gt-quote-link" href={CONTACT_URL}>
                聯絡我們
              </a>
            </>
          ) : (
            // refunded
            <>
              <div className="gt-quote-banner gt-quote-banner-muted">此筆款項已退款，若有疑問歡迎與我們聯繫。</div>
              <a className="gt-quote-link" href={CONTACT_URL}>
                聯絡我們
              </a>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="gt-quote-footer">
          線上付款由 PChomePay 支付連提供金流服務。
          <br />
          給樂數位 Gather
        </div>
      </div>
    </main>
  );
}
