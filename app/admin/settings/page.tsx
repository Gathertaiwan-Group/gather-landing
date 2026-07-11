import AdminHeader from "@/components/admin/AdminHeader";
import SettingsForm from "@/components/admin/SettingsForm";
import {
  getSetting,
  DEFAULT_COMPANY_PROFILE,
  DEFAULT_CONTRACT_TEMPLATE,
  DEFAULT_DEPOSIT_RATIO,
  type CompanyProfile,
} from "@/lib/settings";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminSettingsPage() {
  const [company_profile, deposit_ratio, contract_template] = await Promise.all([
    getSetting<CompanyProfile>("company_profile", DEFAULT_COMPANY_PROFILE),
    getSetting<number>("deposit_ratio", DEFAULT_DEPOSIT_RATIO),
    getSetting<string>("contract_template", DEFAULT_CONTRACT_TEMPLATE),
  ]);

  return (
    <>
      <AdminHeader />
      <main className="gt-admin-shell">
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "#1d1d1f", margin: "0 0 22px" }}>系統設定</h1>
        <SettingsForm initial={{ company_profile, deposit_ratio, contract_template }} />
      </main>
    </>
  );
}
