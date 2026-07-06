import Link from "next/link";
import { notFound } from "next/navigation";
import AdminHeader from "@/components/admin/AdminHeader";
import QuoteEditor from "@/components/admin/QuoteEditor";
import { getQuote } from "@/lib/quote";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminQuoteDetailPage({ params }: { params: { id: string } }) {
  const quote = await getQuote(params.id);
  if (!quote) notFound();

  return (
    <>
      <AdminHeader />
      <main className="gt-admin-shell">
        <Link
          href="/admin/quotes"
          style={{ display: "inline-block", fontSize: 13.5, color: "#1668c2", textDecoration: "none", marginBottom: 14 }}
        >
          ← 回報價單列表
        </Link>
        <QuoteEditor quote={quote} />
      </main>
    </>
  );
}
