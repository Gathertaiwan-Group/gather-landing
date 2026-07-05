import type { Metadata } from "next";

// 後台一律動態渲染（依 cookie / DB，不快取）
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "給樂數位 後台",
  robots: { index: false, follow: false },
};

/**
 * 後台外層：只提供淺灰背景容器。
 * 注意：登入頁 /admin/login 共用此 layout，必須維持無 chrome，
 * 因此這裡「不」渲染 AdminHeader——各已登入頁自行放 <AdminHeader/>。
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: "100vh", background: "#f5f5f7" }}>{children}</div>;
}
