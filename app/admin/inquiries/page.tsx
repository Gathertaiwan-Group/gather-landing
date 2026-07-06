import AdminHeader from "@/components/admin/AdminHeader";
import TranscriptRow from "@/components/admin/TranscriptRow";
import ContactSubmissionCard from "@/components/admin/ContactSubmissionCard";
import { getChatLogs } from "@/lib/adminChat";
import { getContactSubmissions } from "@/lib/adminContact";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function InquiriesPage() {
  const [logs, subs] = await Promise.all([getChatLogs(100), getContactSubmissions(100)]);

  return (
    <>
      <AdminHeader />
      <main className="gt-admin-shell">
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "#1d1d1f", margin: "0 0 6px" }}>客人諮詢</h1>
        <p style={{ fontSize: 14.5, color: "#86868b", margin: "0 0 30px", lineHeight: 1.6 }}>
          網站聯絡表單與 AI 客服對話都會匯集在這裡（從上線起累積）。
        </p>

        {/* 網站聯絡表單 */}
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1d1d1f", margin: "0 0 14px" }}>
          📮 網站聯絡表單{" "}
          <span style={{ color: "#86868b", fontWeight: 500, fontSize: 15 }}>（{subs.length}）</span>
        </h2>
        {subs.length === 0 ? (
          <div className="gt-admin-card" style={{ color: "#86868b", fontSize: 14.5, lineHeight: 1.7, padding: "24px", marginBottom: 36 }}>
            還沒有聯絡表單。當有訪客在官網填寫聯絡表單後，會出現在這裡（並寄 Email 通知你）。
          </div>
        ) : (
          <div style={{ marginBottom: 36 }}>
            {subs.map((s) => (
              <ContactSubmissionCard key={s.id} sub={s} />
            ))}
          </div>
        )}

        {/* AI 客服對話 */}
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1d1d1f", margin: "0 0 6px" }}>
          💬 AI 客服對話{" "}
          <span style={{ color: "#86868b", fontWeight: 500, fontSize: 15 }}>（{logs.length}）</span>
        </h2>
        <p style={{ fontSize: 13.5, color: "#86868b", margin: "0 0 16px" }}>
          📇 標記＝客人已在對話中留下聯絡方式（自動置頂）。
        </p>
        {logs.length === 0 ? (
          <div className="gt-admin-card" style={{ textAlign: "center", color: "#86868b", fontSize: 14.5, lineHeight: 1.7, padding: "40px 24px" }}>
            目前還沒有 AI 客服對話紀錄。當有訪客在網站上使用 AI 客服後，完整對話就會出現在這裡。
          </div>
        ) : (
          <div>
            {logs.map((log) => (
              <TranscriptRow key={log.id} log={log} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
