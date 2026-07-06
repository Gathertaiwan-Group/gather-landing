import AdminHeader from "@/components/admin/AdminHeader";
import CaseTable from "@/components/admin/CaseTable";
import { getCases } from "@/lib/adminCases";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CasesPage({
  searchParams,
}: {
  searchParams: {
    new?: string;
    session?: string;
    title?: string;
    note?: string;
    name?: string;
    email?: string;
    phone?: string;
    line?: string;
  };
}) {
  const cases = await getCases();

  // 從諮詢紀錄「建立案件」帶參數過來時，組出預填資料讓 Modal 自動開啟
  const prefill =
    searchParams.new === "1"
      ? {
          title: searchParams.title ?? "",
          notes: searchParams.note ?? "",
          source: "ai_chat",
          session_id: searchParams.session ?? "",
          client_name: searchParams.name ?? "",
          contact_email: searchParams.email ?? "",
          contact_phone: searchParams.phone ?? "",
          contact_line: searchParams.line ?? "",
        }
      : undefined;

  return (
    <>
      <AdminHeader />
      <main className="gt-admin-shell">
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "#1d1d1f", margin: "0 0 22px" }}>案件管理</h1>
        <CaseTable cases={cases} prefill={prefill} />
      </main>
    </>
  );
}
