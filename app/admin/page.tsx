import Link from "next/link";
import AdminHeader from "@/components/admin/AdminHeader";
import StatCard from "@/components/admin/StatCard";
import { getChatLogs, getContactCount } from "@/lib/adminChat";
import { getCases, STATUS_COLORS } from "@/lib/adminCases";
import { getToolCountSince } from "@/lib/adminTool";
import { getContactSubmissionCount } from "@/lib/adminContact";
import { getDraftQuoteCount, moneyTWD } from "@/lib/quote";
import { getFunnelStats, getRevenueStats, pct } from "@/lib/adminStats";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// YYYY.MM.DD HH:mm
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function StatusChip({ status }: { status: string }) {
  const c = STATUS_COLORS[status] ?? { fg: "#6e6e73", bg: "#ececee" };
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
      {status}
    </span>
  );
}

export default async function AdminOverviewPage() {
  const [logs, cases, toolCount, contactCount, formCount, draftCount, funnel, revenue] = await Promise.all([
    getChatLogs(100),
    getCases(),
    getToolCountSince(7),
    getContactCount(),
    getContactSubmissionCount(),
    getDraftQuoteCount(),
    getFunnelStats(),
    getRevenueStats(),
  ]);

  const inProgress = cases.filter((c) => c.status === "進行中").length;
  const recentLogs = logs.slice(0, 5);
  const recentCases = cases.slice(0, 5);

  // 轉換漏斗各段（對話 → … → 已結案）；bar 寬以最大段為基準，轉換率相對上一段。
  const funnelSteps: Array<{ label: string; value: number }> = [
    { label: "對話", value: funnel.chats },
    { label: "有留聯", value: funnel.chatsWithContact },
    { label: "報價", value: funnel.quotes },
    { label: "已接受", value: funnel.quotesAccepted },
    { label: "已簽約", value: funnel.contractsSigned },
    { label: "已收訂金", value: funnel.depositsPaid },
    { label: "進行中", value: funnel.casesInProgress },
    { label: "已結案", value: funnel.casesClosed },
  ];
  const funnelMax = Math.max(...funnelSteps.map((s) => s.value), 1);

  return (
    <>
      <AdminHeader />
      <main className="gt-admin-shell">
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "#1d1d1f", margin: "0 0 22px" }}>總覽</h1>

        {/* 計數卡 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
            gap: 16,
            marginBottom: 28,
          }}
        >
          <StatCard label="聯絡表單" value={formCount} href="/admin/inquiries" hint="網站表單送出" />
          <StatCard label="諮詢對話數" value={logs.length} href="/admin/inquiries" />
          <StatCard label="留下聯絡" value={contactCount} href="/admin/inquiries" hint="AI 對話留聯絡" />
          <StatCard label="待審報價" value={draftCount} href="/admin/quotes" hint="AI 草稿待審" />
          <StatCard label="進行中案件" value={inProgress} href="/admin/cases" />
          <StatCard label="總案件數" value={cases.length} href="/admin/cases" />
          <StatCard label="本週 AI 工具試用" value={toolCount} hint="近 7 天" />
        </div>

        {/* 營收概況（錢）*/}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
            gap: 16,
            marginBottom: 28,
          }}
        >
          <StatCard label="本月營收" value={moneyTWD(revenue.paidThisMonth)} hint="本月已收款（台北時區）" />
          <StatCard label="應收帳款" value={moneyTWD(revenue.receivable)} hint="待付款請款單合計" />
          <StatCard label="累計營收" value={moneyTWD(revenue.paidAllTime)} hint="歷來已收款總額" />
        </div>

        {/* 轉換漏斗（對話 → … → 已結案；bar 相對最大段、轉換率相對上一段）*/}
        <section className="gt-admin-card" style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1d1d1f", margin: 0 }}>轉換漏斗</h2>
            <span style={{ fontSize: 12.5, color: "#86868b" }}>右側百分比＝相對上一段轉換率</span>
          </div>
          <div className="gt-funnel">
            {funnelSteps.map((step, i) => {
              const prev = i > 0 ? funnelSteps[i - 1].value : null;
              const rate = prev !== null ? pct(step.value, prev) : null;
              const barPct = pct(step.value, funnelMax);
              return (
                <div className="gt-funnel-row" key={step.label}>
                  <span className="gt-funnel-label">{step.label}</span>
                  <div className="gt-funnel-track">
                    <div className="gt-funnel-fill" style={{ width: `${barPct}%` }} />
                  </div>
                  <span className="gt-funnel-count">{step.value}</span>
                  <span className="gt-funnel-rate">{rate !== null ? `${rate}%` : "—"}</span>
                </div>
              );
            })}
          </div>
        </section>

        <div style={{ display: "grid", gap: 20 }}>
          {/* 最近諮詢 */}
          <section className="gt-admin-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1d1d1f", margin: 0 }}>最近諮詢</h2>
              <Link href="/admin/inquiries" style={{ fontSize: 13.5, color: "#1668c2", textDecoration: "none" }}>
                查看全部 →
              </Link>
            </div>
            {recentLogs.length === 0 ? (
              <p style={{ color: "#86868b", fontSize: 14.5, margin: 0 }}>還沒有 AI 客服對話紀錄。</p>
            ) : (
              <div style={{ display: "grid", gap: 2 }}>
                {recentLogs.map((log) => (
                  <Link
                    key={log.id}
                    href="/admin/inquiries"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 14,
                      padding: "11px 4px",
                      borderBottom: "1px solid rgba(0,0,0,.05)",
                      textDecoration: "none",
                    }}
                  >
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 14.5,
                        color: "#1d1d1f",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {log.has_contact ? "📇 " : ""}
                      {log.first_question?.trim() || "（無提問內容）"}
                    </span>
                    <span style={{ fontSize: 12.5, color: "#86868b", whiteSpace: "nowrap", flexShrink: 0 }}>
                      {log.message_count} 則 · {formatDateTime(log.updated_at)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* 最近案件 */}
          <section className="gt-admin-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1d1d1f", margin: 0 }}>最近案件</h2>
              <Link href="/admin/cases" style={{ fontSize: 13.5, color: "#1668c2", textDecoration: "none" }}>
                查看全部 →
              </Link>
            </div>
            {recentCases.length === 0 ? (
              <p style={{ color: "#86868b", fontSize: 14.5, margin: 0 }}>還沒有案件。</p>
            ) : (
              <div style={{ display: "grid", gap: 2 }}>
                {recentCases.map((c) => (
                  <Link
                    key={c.id}
                    href="/admin/cases"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 14,
                      padding: "11px 4px",
                      borderBottom: "1px solid rgba(0,0,0,.05)",
                      textDecoration: "none",
                    }}
                  >
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 14.5,
                        color: "#1d1d1f",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <strong style={{ fontWeight: 600 }}>{c.client_name}</strong>
                      <span style={{ color: "#86868b" }}> · {c.title}</span>
                    </span>
                    <StatusChip status={c.status} />
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
