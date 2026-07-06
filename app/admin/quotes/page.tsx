import AdminHeader from "@/components/admin/AdminHeader";
import QuoteTable from "@/components/admin/QuoteTable";
import { getQuotes } from "@/lib/quote";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminQuotesPage() {
  const quotes = await getQuotes();

  return (
    <>
      <AdminHeader />
      <main className="gt-admin-shell">
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "#1d1d1f", margin: "0 0 6px" }}>報價單</h1>
        <p style={{ fontSize: 14.5, color: "#86868b", margin: "0 0 22px" }}>
          AI 產生的草稿會出現在這裡，核准後寄給客人。
        </p>

        {quotes.length === 0 ? (
          <div className="gt-admin-card">
            <p style={{ color: "#86868b", fontSize: 14.5, margin: 0, lineHeight: 1.7 }}>
              還沒有報價單。當客人在 AI 客服同意收報價後，草稿會出現在這裡待你審核。
            </p>
          </div>
        ) : (
          <QuoteTable quotes={quotes} />
        )}
      </main>
    </>
  );
}
