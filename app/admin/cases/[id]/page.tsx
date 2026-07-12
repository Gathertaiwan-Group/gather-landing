import Link from "next/link";
import { notFound } from "next/navigation";
import AdminHeader from "@/components/admin/AdminHeader";
import StatusSelect from "@/components/admin/StatusSelect";
import CaseTimeline from "@/components/admin/CaseTimeline";
import CaseActions from "@/components/admin/CaseActions";
import MilestonePanel from "@/components/admin/MilestonePanel";
import DeliverablePanel from "@/components/admin/DeliverablePanel";
import UpdatesPanel from "@/components/admin/UpdatesPanel";
import { getCase, SOURCE_LABELS } from "@/lib/adminCases";
import { getQuote, getQuoteIdBySession, type Quote } from "@/lib/quote";
import { getContract, getContractByQuoteId, type Contract } from "@/lib/contract";
import { getPaymentsByCase, getPaymentsByQuote, type Payment } from "@/lib/payment";
import { listMilestones, listUpdates, listDeliverables, ensurePortalToken } from "@/lib/portal";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// YYYY.MM.DD HH:mm（照後台其他頁格式）
function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const infoLabel: React.CSSProperties = { fontSize: 12.5, color: "#86868b", marginBottom: 3 };
const infoValue: React.CSSProperties = { fontSize: 14, color: "#1d1d1f" };

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={infoLabel}>{label}</div>
      <div style={infoValue}>{value ?? "—"}</div>
    </div>
  );
}

export default async function AdminCaseDetailPage({ params }: { params: { id: string } }) {
  const caseRow = await getCase(params.id);
  if (!caseRow) notFound();

  // ── 金流鏈：報價（case.quote_id，退回以 session 配對）→ 合約 → 請款單 ──
  const quoteId = caseRow.quote_id ?? (caseRow.session_id ? await getQuoteIdBySession(caseRow.session_id) : null);
  const quote: Quote | null = quoteId ? await getQuote(quoteId) : null;

  let contract: Contract | null = caseRow.contract_id ? await getContract(caseRow.contract_id) : null;
  if (!contract && quote) contract = await getContractByQuoteId(quote.id);

  const [byCase, byQuote] = await Promise.all([
    getPaymentsByCase(caseRow.id),
    quote ? getPaymentsByQuote(quote.id) : Promise.resolve([] as Payment[]),
  ]);
  const seen = new Set<string>();
  const payments = [...byCase, ...byQuote]
    .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  // ── P1 客戶專案入口：里程碑／動態／交付物（後台含 draft）＋ portal token（lazy 產生）──
  const [milestones, updates, deliverables, portalToken] = await Promise.all([
    listMilestones(caseRow.id),
    listUpdates(caseRow.id),
    listDeliverables(caseRow.id, { includeDraft: true }),
    ensurePortalToken(caseRow.id),
  ]);

  return (
    <>
      <AdminHeader />
      <main className="gt-admin-shell">
        <Link
          href="/admin/cases"
          style={{ display: "inline-block", fontSize: 13.5, color: "#1668c2", textDecoration: "none", marginBottom: 14 }}
        >
          ← 回案件列表
        </Link>

        <div style={{ display: "grid", gap: 20, maxWidth: 900 }}>
          {/* 案件基本資料 */}
          <div className="gt-admin-card">
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1d1d1f", margin: 0 }}>{caseRow.title}</h1>
              <StatusSelect id={caseRow.id} value={caseRow.status} />
              {caseRow.auto_opened && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#1668c2",
                    background: "#e2effb",
                    borderRadius: 6,
                    padding: "2px 7px",
                    letterSpacing: ".04em",
                  }}
                >
                  自動開案
                </span>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14 }}>
              <Info label="客戶" value={caseRow.client_name} />
              <Info label="來源" value={SOURCE_LABELS[caseRow.source] ?? caseRow.source} />
              <Info label="Email" value={caseRow.contact_email} />
              <Info label="電話" value={caseRow.contact_phone} />
              <Info label="LINE" value={caseRow.contact_line} />
              <Info
                label="預算"
                value={caseRow.budget != null ? `${caseRow.currency ?? "TWD"} ${caseRow.budget.toLocaleString("en-US")}` : "—"}
              />
              <Info label="訂金入帳" value={formatDateTime(caseRow.deposit_paid_at)} />
              <Info label="尾款入帳" value={formatDateTime(caseRow.final_paid_at)} />
              <Info label="結案時間" value={formatDateTime(caseRow.closed_at)} />
              <Info label="建立" value={formatDateTime(caseRow.created_at)} />
              <Info label="更新" value={formatDateTime(caseRow.updated_at)} />
            </div>

            {caseRow.notes && (
              <div style={{ marginTop: 14 }}>
                <div style={infoLabel}>備註</div>
                <div style={{ ...infoValue, whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{caseRow.notes}</div>
              </div>
            )}
          </div>

          {/* 金流 timeline：報價 → 合約 → 請款 */}
          <CaseTimeline quote={quote} contract={contract} payments={payments} />

          {/* 操作：完工請尾款／標記收款／作廢合約 */}
          <CaseActions caseId={caseRow.id} caseStatus={caseRow.status} contract={contract} payments={payments} />

          {/* P1 客戶專案入口：portal 連結＋里程碑管理 */}
          <MilestonePanel caseId={caseRow.id} milestones={milestones} portalToken={portalToken} />

          {/* P1：交付物上傳／發布給客戶驗收 */}
          <DeliverablePanel caseId={caseRow.id} deliverables={deliverables} />

          {/* P1：專案動態 feed＋回覆客戶 */}
          <UpdatesPanel caseId={caseRow.id} updates={updates} hasClientEmail={!!caseRow.contact_email} />
        </div>
      </main>
    </>
  );
}
