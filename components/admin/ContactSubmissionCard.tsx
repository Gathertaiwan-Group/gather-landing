import type { ContactSubmission } from "@/lib/adminContact";

// YYYY.MM.DD HH:mm
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 一筆網站聯絡表單（純呈現）。 */
export default function ContactSubmissionCard({ sub }: { sub: ContactSubmission }) {
  const contacts = [sub.email, sub.phone].filter(Boolean).join(" · ");
  return (
    <div className="gt-admin-card" style={{ marginBottom: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 15.5, fontWeight: 700, color: "#1d1d1f" }}>
          {sub.name}
          {contacts && (
            <span style={{ fontWeight: 400, color: "#6e6e73", fontSize: 14 }}> · {contacts}</span>
          )}
        </div>
        <div style={{ fontSize: 12.5, color: "#86868b", whiteSpace: "nowrap" }}>
          {formatDateTime(sub.created_at)}
        </div>
      </div>
      <div
        style={{
          marginTop: 10,
          fontSize: 14.5,
          color: "#1d1d1f",
          whiteSpace: "pre-wrap",
          lineHeight: 1.65,
        }}
      >
        {sub.message}
      </div>
    </div>
  );
}
