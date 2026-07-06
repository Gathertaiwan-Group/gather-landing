import { notFound } from "next/navigation";
import AcceptButton from "@/components/quote/AcceptButton";
import { getQuoteByToken, markQuoteViewed, isExpired, moneyTWD, type Quote } from "@/lib/quote";

// 公開報價頁：以 service_role 的 server helper 讀取（不碰 anon client，RLS 保持鎖住）。
export const dynamic = "force-dynamic";
export const metadata = {
  robots: { index: false, follow: false },
};

const CONTACT_URL = "https://gathertaiwan.com/#contact";

/** ISO 字串 → YYYY.MM.DD；無值回空字串。 */
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

export default async function QuotePage({ params }: { params: { token: string } }) {
  const quote = await getQuoteByToken(params.token);
  if (!quote) notFound();

  // 首次瀏覽：status sent→viewed、記 viewed_at（非 'sent' 則 no-op）。
  await markQuoteViewed(quote.id);

  const accepted = !!quote.accepted_at || quote.status === "accepted";
  const expired = !accepted && isExpired(quote);
  const createdStr = fmtDate(quote.created_at);
  const validStr = fmtDate(quote.valid_until);
  const acceptedStr = fmtDate(quote.accepted_at);
  const items = Array.isArray(quote.line_items) ? quote.line_items : [];

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
            <div className="gt-quote-meta-label">報價單編號</div>
            <div className="gt-quote-meta-value">{quote.quote_no ?? "—"}</div>
          </div>
        </div>

        {/* 客戶 / 日期 */}
        <div className="gt-quote-info">
          {quote.client_name && (
            <div className="gt-quote-info-row">
              <span className="gt-quote-info-k">客戶</span>
              <span className="gt-quote-info-v">{quote.client_name}</span>
            </div>
          )}
          {createdStr && (
            <div className="gt-quote-info-row">
              <span className="gt-quote-info-k">日期</span>
              <span className="gt-quote-info-v">{createdStr}</span>
            </div>
          )}
          {validStr && (
            <div className="gt-quote-info-row">
              <span className="gt-quote-info-k">有效期限</span>
              <span className="gt-quote-info-v">{validStr}</span>
            </div>
          )}
        </div>

        {/* 項目表 */}
        <div className="gt-quote-table-wrap">
          <table className="gt-quote-table">
            <thead>
              <tr>
                <th>項目</th>
                <th className="num">數量</th>
                <th className="num">單價</th>
                <th className="num">小計</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i}>
                  <td>{it.description}</td>
                  <td className="num">{it.qty}</td>
                  <td className="num">{moneyTWD(it.unit_price)}</td>
                  <td className="num">{moneyTWD(it.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="gt-quote-sum-label" colSpan={3}>
                  小計
                </td>
                <td className="num">{moneyTWD(quote.subtotal)}</td>
              </tr>
              {!!quote.tax && quote.tax > 0 && (
                <tr>
                  <td className="gt-quote-sum-label" colSpan={3}>
                    營業稅
                  </td>
                  <td className="num">{moneyTWD(quote.tax)}</td>
                </tr>
              )}
              <tr className="gt-quote-total-row">
                <td className="gt-quote-sum-label" colSpan={3}>
                  總計
                </td>
                <td className="num">{moneyTWD(quote.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* 備註 */}
        {quote.notes && <div className="gt-quote-notes">{quote.notes}</div>}

        {/* 動作區 */}
        <div className="gt-quote-actions">
          {accepted ? (
            <div className="gt-quote-banner gt-quote-banner-ok" role="status">
              ✅ 您已{acceptedStr ? `於 ${acceptedStr} ` : ""}接受此報價，謝謝！我們會盡快與您聯繫。
            </div>
          ) : expired ? (
            <>
              <div className="gt-quote-banner gt-quote-banner-muted">
                此報價已過期，若仍有需求歡迎與我們聯繫。
              </div>
              <a className="gt-quote-link" href={CONTACT_URL}>
                聯絡我們
              </a>
            </>
          ) : (
            <>
              <AcceptButton token={params.token} />
              <a className="gt-quote-link" href={CONTACT_URL}>
                有問題？聯絡我們
              </a>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="gt-quote-footer">
          此為初步報價，實際內容可依需求討論調整。
          <br />
          給樂數位 Gather
        </div>
      </div>
    </main>
  );
}
