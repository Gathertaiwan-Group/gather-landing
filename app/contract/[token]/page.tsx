import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import SignBox from "@/components/contract/SignBox";
import { getContractByToken, CONTRACT_STATUS_LABELS, CONTRACT_STATUS_COLORS } from "@/lib/contract";
import { getPaymentsByQuote, type Payment } from "@/lib/payment";

// 公開合約簽署頁：以 service_role 的 server helper 讀取（RLS 保持鎖住）。
export const dynamic = "force-dynamic";
export const metadata = {
  title: "服務合約 — 給樂數位 Gather",
  robots: { index: false, follow: false },
};

const CONTACT_URL = "https://gathertaiwan.com/#contact";

/** ISO 字串 → YYYY.MM.DD（台北時區）；無值回空字串。 */
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const t = new Date(d.getTime() + 8 * 3600000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}.${p(t.getUTCMonth() + 1)}.${p(t.getUTCDate())}`;
}

/** ISO 字串 → YYYY.MM.DD HH:mm（台北時區）；無值回空字串。 */
function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const t = new Date(d.getTime() + 8 * 3600000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}.${p(t.getUTCMonth() + 1)}.${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
}

export default async function ContractPage({ params }: { params: { token: string } }) {
  const contract = await getContractByToken(params.token);
  if (!contract || contract.status === "voided") notFound();

  const signed = contract.status === "signed";

  // 已簽 → 找該報價的訂金請款單，給「前往付款」連結。
  let deposit: Payment | null = null;
  if (signed && contract.quote_id) {
    const payments = await getPaymentsByQuote(contract.quote_id);
    deposit = payments.find((p) => p.kind === "deposit" && p.public_token) ?? null;
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
            <div className="gt-quote-meta-label">合約編號</div>
            <div className="gt-quote-meta-value">{contract.contract_no ?? "—"}</div>
          </div>
        </div>

        {/* 客戶 / 日期 / 狀態 */}
        <div className="gt-quote-info">
          {contract.client_name && (
            <div className="gt-quote-info-row">
              <span className="gt-quote-info-k">客戶</span>
              <span className="gt-quote-info-v">{contract.client_name}</span>
            </div>
          )}
          {contract.sent_at && (
            <div className="gt-quote-info-row">
              <span className="gt-quote-info-k">日期</span>
              <span className="gt-quote-info-v">{fmtDate(contract.sent_at)}</span>
            </div>
          )}
          <div className="gt-quote-info-row">
            <span className="gt-quote-info-k">狀態</span>
            <span className={CONTRACT_STATUS_COLORS[contract.status]}>{CONTRACT_STATUS_LABELS[contract.status]}</span>
          </div>
        </div>

        {/* 合約全文（Markdown） */}
        <div className="gt-contract-md">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
            {contract.content_md ?? ""}
          </ReactMarkdown>
        </div>

        {/* 動作區 */}
        {signed ? (
          <div className="gt-quote-actions">
            <div className="gt-quote-banner gt-quote-banner-ok" role="status">
              ✅ 本合約已完成簽署
            </div>
            <div className="gt-contract-signedinfo">
              <span>
                簽署人：<b>{contract.signer_name ?? "—"}</b>
              </span>
              <span>
                簽署時間：<b>{fmtDateTime(contract.signed_at) || "—"}</b>
              </span>
            </div>
            {deposit && deposit.status === "pending" && deposit.public_token && (
              <>
                <a className="gt-quote-accept" style={{ textDecoration: "none" }} href={`/pay/${deposit.public_token}`}>
                  前往付款
                </a>
                <p className="gt-pay-note">簽約訂金尚未付款，付款完成後我們會立即開工。</p>
              </>
            )}
            {deposit && deposit.status === "paid" && (
              <p className="gt-pay-note">簽約訂金已完成付款，感謝您！我們已依合約內容開始執行專案。</p>
            )}
            <a className="gt-quote-link" href={CONTACT_URL}>
              有問題？聯絡我們
            </a>
          </div>
        ) : contract.status === "sent" ? (
          <>
            <SignBox token={params.token} />
            <div className="gt-quote-actions" style={{ margin: "10px 0 0" }}>
              <a className="gt-quote-link" href={CONTACT_URL}>
                對條款有疑問？聯絡我們
              </a>
            </div>
          </>
        ) : (
          // draft（理論上不會有 public_token，防禦性顯示）
          <div className="gt-quote-actions">
            <div className="gt-quote-banner gt-quote-banner-muted">此合約尚未開放簽署，若有疑問請聯絡我們。</div>
            <a className="gt-quote-link" href={CONTACT_URL}>
              聯絡我們
            </a>
          </div>
        )}

        {/* Footer */}
        <div className="gt-quote-footer">
          本合約以電子方式簽署，與書面簽署具同等之效力。
          <br />
          給樂數位 Gather
        </div>
      </div>
    </main>
  );
}
