import AdminHeader from "@/components/admin/AdminHeader";
import TranscriptRow from "@/components/admin/TranscriptRow";
import { getChatLogs } from "@/lib/adminChat";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function InquiriesPage() {
  const logs = await getChatLogs(100);

  return (
    <>
      <AdminHeader />
      <main className="gt-admin-shell">
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "#1d1d1f", margin: "0 0 6px" }}>
          客人諮詢對話紀錄
        </h1>
        <p style={{ fontSize: 14.5, color: "#86868b", margin: "0 0 24px", lineHeight: 1.6 }}>
          這裡是網站 AI 客服的對話紀錄，從上線起累積。LINE 諮詢不在此。
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
