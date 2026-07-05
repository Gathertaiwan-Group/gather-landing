"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CASE_STATUSES, STATUS_COLORS } from "@/lib/adminCases";

type Props = { id: string; value: string };

/** 案件狀態下拉：呈現成彩色藥丸，改變即樂觀更新 + PATCH，失敗還原。 */
export default function StatusSelect({ id, value }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState(value);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(false);

  const c = STATUS_COLORS[status] ?? { fg: "#6e6e73", bg: "#ececee" };

  async function onChange(next: string) {
    const prev = status;
    setStatus(next); // 樂觀
    setSaving(true);
    setErr(false);
    try {
      const res = await fetch("/api/admin/cases", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: next }),
      });
      if (!res.ok) throw new Error("patch failed");
      router.refresh();
    } catch {
      setStatus(prev); // 還原
      setErr(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 3 }}>
      <select
        value={status}
        disabled={saving}
        onChange={(e) => onChange(e.target.value)}
        aria-label="變更案件狀態"
        style={{
          appearance: "none",
          WebkitAppearance: "none",
          MozAppearance: "none",
          color: c.fg,
          background: c.bg,
          border: "none",
          borderRadius: 980,
          padding: "3px 26px 3px 12px",
          fontSize: 13,
          fontWeight: 600,
          cursor: saving ? "default" : "pointer",
          opacity: saving ? 0.6 : 1,
          // 自繪下拉箭頭（避免瀏覽器預設樣式破壞藥丸外觀）
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path d='M1 1l4 4 4-4' fill='none' stroke='%236e6e73' stroke-width='1.5' stroke-linecap='round'/></svg>\")",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 9px center",
        }}
      >
        {CASE_STATUSES.map((s) => (
          <option key={s} value={s} style={{ color: "#1d1d1f", background: "#fff" }}>
            {s}
          </option>
        ))}
      </select>
      {err && <span style={{ fontSize: 11, color: "#d23f3f" }}>更新失敗，請重試</span>}
    </span>
  );
}
