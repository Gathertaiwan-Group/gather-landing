import Link from "next/link";

const BRAND_BLUE = "#1668c2";

type Props = {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
};

/** 總覽計數卡：大數字 + 標籤（可選 hint / 連結）。純呈現。 */
export default function StatCard({ label, value, hint, href }: Props) {
  const inner = (
    <div className="gt-admin-card" style={{ height: "100%" }}>
      <div style={{ fontSize: 34, fontWeight: 700, color: BRAND_BLUE, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 13, color: "#86868b", marginTop: 6 }}>{label}</div>
      {hint && <div style={{ fontSize: 12, color: "#c2c2c8", marginTop: 4 }}>{hint}</div>}
    </div>
  );

  if (href) {
    return (
      <Link href={href} style={{ textDecoration: "none", display: "block" }}>
        {inner}
      </Link>
    );
  }
  return inner;
}
