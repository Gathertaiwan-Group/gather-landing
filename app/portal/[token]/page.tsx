import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import CommentBox from "@/components/portal/CommentBox";
import ReviewButtons from "@/components/portal/ReviewButtons";
import {
  getCaseByPortalToken,
  listMilestones,
  listUpdates,
  listDeliverables,
  milestonesProgress,
  MILESTONE_STATUS_LABELS,
  DELIVERABLE_STATUS_LABELS,
  DELIVERABLE_STATUS_COLORS,
} from "@/lib/portal";
import { signedDeliverableUrl } from "@/lib/storage";
import { STATUS_COLORS } from "@/lib/adminCases";

// 公開客戶專案入口：以 service_role 的 server helper 讀取（RLS 保持鎖住），
// token 查無 → 404。金流資訊不放這裡（付款走 /pay 信件連結）。
export const dynamic = "force-dynamic";
export const metadata = {
  title: "專案進度 — 給樂數位 Gather",
  robots: { index: false, follow: false },
};

const CONTACT_URL = "https://gathertaiwan.com/#contact";

/** 動態作者顯示名稱（client 視角）。 */
const AUTHOR_LABELS: Record<string, string> = {
  owner: "給樂數位",
  client: "您",
  system: "系統通知",
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

/** ISO 字串 → YYYY.MM.DD HH:mm（台北時區）；無值回空字串。 */
function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const t = new Date(d.getTime() + 8 * 3600000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}.${p(t.getUTCMonth() + 1)}.${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
}

export default async function PortalPage({ params }: { params: { token: string } }) {
  // Next 14.2 陷阱：force-dynamic 只保證動態「渲染」，supabase-js 的 REST GET 仍會落入
  // fetch data cache（實測 revalidate 被寫成 31536000 → 留言/驗收後頁面停在舊資料）。
  // noStore() 讓本次 request 全程繞過 data cache，portal 永遠讀最新狀態。
  noStore();
  const caseRow = await getCaseByPortalToken(params.token);
  if (!caseRow) notFound();

  const [milestones, updates, deliverables] = await Promise.all([
    listMilestones(caseRow.id),
    listUpdates(caseRow.id, 100),
    listDeliverables(caseRow.id), // 不含 draft
  ]);
  const progress = milestonesProgress(milestones);

  // 有檔案的交付物：server 端先取一小時簽名 URL；產不出（檔案不存在等）→ null，前端優雅缺省。
  const downloadUrls = new Map<string, string | null>();
  await Promise.all(
    deliverables
      .filter((d) => d.file_path)
      .map(async (d) => {
        downloadUrls.set(d.id, await signedDeliverableUrl(d.file_path as string));
      })
  );

  const statusColor = STATUS_COLORS[caseRow.status] ?? { fg: "#6e6e73", bg: "#ececee" };

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
            <div className="gt-quote-meta-label">客戶專案入口</div>
            <div className="gt-quote-meta-value">專案進度</div>
          </div>
        </div>

        {/* 案件抬頭＋狀態 */}
        <h1 className="gt-portal-title">{caseRow.title}</h1>
        <div className="gt-quote-info">
          <div className="gt-quote-info-row">
            <span className="gt-quote-info-k">客戶</span>
            <span className="gt-quote-info-v">{caseRow.client_name}</span>
          </div>
          <div className="gt-quote-info-row">
            <span className="gt-quote-info-k">狀態</span>
            <span className="gt-status-chip" style={{ color: statusColor.fg, background: statusColor.bg }}>
              {caseRow.status}
            </span>
          </div>
        </div>

        {/* 進度條 */}
        <section className="gt-portal-section" aria-label="專案進度">
          <h2 className="gt-portal-section-title">專案進度</h2>
          {progress.total === 0 ? (
            <p className="gt-portal-empty">尚未設定里程碑，最新進度請見下方「專案動態」。</p>
          ) : (
            <div className="gt-portal-progress">
              <div
                className="gt-portal-progress-track"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress.pct}
              >
                <div className="gt-portal-progress-fill" style={{ width: `${progress.pct}%` }} />
              </div>
              <div className="gt-portal-progress-label">
                已完成 {progress.done} / {progress.total} 個里程碑（{progress.pct}%）
              </div>
            </div>
          )}
        </section>

        {/* 里程碑 timeline */}
        {milestones.length > 0 && (
          <section className="gt-portal-section" aria-label="里程碑">
            <h2 className="gt-portal-section-title">里程碑</h2>
            <ol className="gt-portal-tl">
              {milestones.map((m) => (
                <li key={m.id} className="gt-portal-tl-item">
                  <span className={`gt-portal-tl-dot gt-portal-tl-dot--${m.status}`} aria-hidden />
                  <div className="gt-portal-tl-body">
                    <div className="gt-portal-tl-title">
                      {m.title}
                      <span className="gt-portal-tl-status">{MILESTONE_STATUS_LABELS[m.status]}</span>
                    </div>
                    {m.description && <p className="gt-portal-tl-desc">{m.description}</p>}
                    {(m.due_date || (m.status === "done" && m.done_at)) && (
                      <div className="gt-portal-tl-meta">
                        {m.due_date && <span>預計 {fmtDate(m.due_date)}</span>}
                        {m.status === "done" && m.done_at && <span>完成於 {fmtDate(m.done_at)}</span>}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* 交付物 */}
        <section className="gt-portal-section" aria-label="交付物">
          <h2 className="gt-portal-section-title">交付物</h2>
          {deliverables.length === 0 ? (
            <p className="gt-portal-empty">目前還沒有交付物，完成後會寄通知到您的信箱。</p>
          ) : (
            deliverables.map((d) => {
              const url = d.file_path ? downloadUrls.get(d.id) ?? null : null;
              return (
                <div className="gt-portal-deliv" key={d.id}>
                  <div className="gt-portal-deliv-head">
                    <span className="gt-portal-deliv-title">
                      {d.title}
                      {d.is_final && <span className="gt-portal-final-badge">最終交付</span>}
                    </span>
                    <span className={DELIVERABLE_STATUS_COLORS[d.status]}>{DELIVERABLE_STATUS_LABELS[d.status]}</span>
                  </div>
                  <div className="gt-portal-deliv-meta">
                    <span>版本 v{d.version}</span>
                    {d.created_at && <span>{fmtDate(d.created_at)}</span>}
                    {d.status === "approved" && d.approved_at && <span>已於 {fmtDate(d.approved_at)} 驗收通過</span>}
                  </div>
                  {url && (
                    <div className="gt-portal-deliv-actions">
                      <a className="gt-portal-download" href={url} target="_blank" rel="noopener noreferrer">
                        下載檔案
                      </a>
                      <span className="gt-portal-deliv-hint">下載連結一小時內有效，過期請重新整理此頁。</span>
                    </div>
                  )}
                  {d.file_path && !url && (
                    <p className="gt-portal-deliv-hint">檔案暫時無法下載，請稍後再試或與我們聯繫。</p>
                  )}
                  {d.content_md && (
                    <details className="gt-portal-md">
                      <summary>展開閱讀內容</summary>
                      <div className="gt-contract-md">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                          {d.content_md}
                        </ReactMarkdown>
                      </div>
                    </details>
                  )}
                  {d.status === "rejected" && d.feedback && (
                    <div className="gt-portal-deliv-feedback">
                      <b>您的修改意見：</b>
                      {d.feedback}
                    </div>
                  )}
                  {d.status === "delivered" && (
                    <ReviewButtons token={params.token} deliverableId={d.id} isFinal={d.is_final} />
                  )}
                </div>
              );
            })
          )}
        </section>

        {/* 動態 feed */}
        <section className="gt-portal-section" aria-label="專案動態">
          <h2 className="gt-portal-section-title">專案動態</h2>
          {updates.length === 0 ? (
            <p className="gt-portal-empty">目前還沒有動態。</p>
          ) : (
            <ul className="gt-portal-feed">
              {updates.map((u) => (
                <li
                  key={u.id}
                  className={`gt-portal-feed-item${u.author === "system" ? " gt-portal-feed-item--system" : ""}`}
                >
                  <div className="gt-portal-feed-head">
                    <span className={`gt-portal-feed-author gt-portal-feed-author--${u.author}`}>
                      {AUTHOR_LABELS[u.author] ?? u.author}
                    </span>
                    <span className="gt-portal-feed-time">{fmtDateTime(u.created_at)}</span>
                  </div>
                  <p className="gt-portal-feed-body">{u.body}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 留言框 */}
        <section className="gt-portal-section" aria-label="留言給我們">
          <h2 className="gt-portal-section-title">留言給我們</h2>
          <CommentBox token={params.token} />
        </section>

        {/* Footer */}
        <div className="gt-quote-footer">
          此頁為您的專屬專案入口，請勿轉傳連結。
          <br />
          有任何問題歡迎<a className="gt-quote-link" href={CONTACT_URL}>聯絡我們</a>｜給樂數位 Gather
        </div>
      </div>
    </main>
  );
}
