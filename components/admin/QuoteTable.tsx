import Link from "next/link";
import { moneyTWD, QUOTE_STATUS_LABELS, QUOTE_STATUS_COLORS, type Quote } from "@/lib/quote";

const BRAND_BLUE = "#1668c2";

type Props = {
  quotes: Quote[];
};

// YYYY.MM.DD HH:mm
function formatDateTime(iso: string): string {
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

/** 報價單列表（純呈現，無互動）。每列連到審核 / 查看頁。 */
export default function QuoteTable({ quotes }: Props) {
  return (
    <div className="gt-admin-card" style={{ padding: 0, overflow: "hidden" }}>
      <div className="gt-admin-table-wrap">
        <table className="gt-admin-table">
          <thead>
            <tr>
              <th>編號</th>
              <th>客戶</th>
              <th style={{ textAlign: "right" }}>金額</th>
              <th>狀態</th>
              <th>建立</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((q) => (
              <tr key={q.id}>
                <td style={{ whiteSpace: "nowrap", color: "#1d1d1f", fontWeight: 600 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {q.quote_no ?? "—"}
                    {q.created_by === "ai" && (
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          color: BRAND_BLUE,
                          background: "#e2effb",
                          borderRadius: 6,
                          padding: "1px 6px",
                          letterSpacing: ".04em",
                        }}
                      >
                        AI
                      </span>
                    )}
                  </span>
                </td>
                <td style={{ color: "#1d1d1f" }}>{q.client_name ?? "—"}</td>
                <td style={{ color: "#1d1d1f", textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                  {moneyTWD(q.total)}
                </td>
                <td>
                  <StatusChip status={q.status} />
                </td>
                <td style={{ color: "#86868b", whiteSpace: "nowrap" }}>{formatDateTime(q.created_at)}</td>
                <td>
                  <Link
                    href={`/admin/quotes/${q.id}`}
                    style={{
                      display: "inline-block",
                      border: `1px solid ${BRAND_BLUE}`,
                      background: "#fff",
                      color: BRAND_BLUE,
                      borderRadius: 980,
                      padding: "5px 14px",
                      fontSize: 13,
                      fontWeight: 500,
                      textDecoration: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    審核 / 查看
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
