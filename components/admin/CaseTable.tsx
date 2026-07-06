"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SOURCE_LABELS, type ClientCase } from "@/lib/adminCases";
import StatusSelect from "./StatusSelect";
import CaseFormModal from "./CaseFormModal";

const BRAND_BLUE = "#1668c2";

type Prefill = {
  title: string;
  notes: string;
  source: string;
  session_id: string;
  client_name: string;
  contact_email: string;
  contact_phone: string;
  contact_line: string;
};

type Props = {
  cases: ClientCase[];
  prefill?: Prefill;
};

// YYYY.MM.DD HH:mm
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function formatBudget(c: ClientCase): string {
  if (c.budget == null) return "—";
  return `${c.currency ?? "TWD"} ${c.budget.toLocaleString("en-US")}`;
}

/** 案件表格 + 新增/編輯 Modal。帶 prefill（從諮詢紀錄轉來）時自動開啟新增。 */
export default function CaseTable({ cases, prefill }: Props) {
  const router = useRouter();
  // 帶 prefill 進來 → 初始就開著新增 Modal
  const [modalOpen, setModalOpen] = useState<boolean>(() => !!prefill);
  const [editing, setEditing] = useState<ClientCase | null>(null);

  // prefill 轉成 Modal 的 initial（無 id → POST 模式）
  const prefillAsInitial: Partial<ClientCase> | null = prefill
    ? {
        title: prefill.title,
        notes: prefill.notes,
        source: prefill.source,
        session_id: prefill.session_id || null,
        client_name: prefill.client_name || "",
        contact_email: prefill.contact_email || null,
        contact_phone: prefill.contact_phone || null,
        contact_line: prefill.contact_line || null,
      }
    : null;

  function openNew() {
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(c: ClientCase) {
    setEditing(c);
    setModalOpen(true);
  }
  function close() {
    setModalOpen(false);
    setEditing(null);
  }

  // Modal 的 initial：編輯優先，其次 prefill（僅首次開啟新增時）
  const initial = editing ?? prefillAsInitial;
  // key 讓切換 editing/prefill 時重建 Modal → 內部受控欄位重新播種
  const modalKey = editing?.id ?? (prefill ? "prefill" : "new");

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <button
          onClick={openNew}
          style={{
            border: "none",
            background: BRAND_BLUE,
            color: "#fff",
            borderRadius: 980,
            padding: "9px 18px",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          ＋ 新增案件
        </button>
      </div>

      <div className="gt-admin-card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="gt-admin-table-wrap">
          <table className="gt-admin-table">
            <thead>
              <tr>
                <th>客戶</th>
                <th>案件</th>
                <th>來源</th>
                <th>狀態</th>
                <th>預算</th>
                <th>更新</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {cases.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ color: "#86868b", padding: "28px 14px", textAlign: "center" }}>
                    還沒有案件，點右上角「新增案件」開始，或到「諮詢紀錄」把一段對話轉成案件。
                  </td>
                </tr>
              ) : (
                cases.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600, color: "#1d1d1f", whiteSpace: "nowrap" }}>{c.client_name}</td>
                    <td style={{ color: "#1d1d1f" }}>{c.title}</td>
                    <td style={{ color: "#6e6e73", whiteSpace: "nowrap" }}>{SOURCE_LABELS[c.source] ?? c.source}</td>
                    <td>
                      <StatusSelect id={c.id} value={c.status} />
                    </td>
                    <td style={{ color: "#6e6e73", whiteSpace: "nowrap" }}>{formatBudget(c)}</td>
                    <td style={{ color: "#86868b", whiteSpace: "nowrap" }}>{formatDateTime(c.updated_at)}</td>
                    <td>
                      <button
                        onClick={() => openEdit(c)}
                        style={{
                          border: `1px solid ${BRAND_BLUE}`,
                          background: "#fff",
                          color: BRAND_BLUE,
                          borderRadius: 980,
                          padding: "5px 14px",
                          fontSize: 13,
                          fontWeight: 500,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        編輯
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <CaseFormModal
        key={modalKey}
        open={modalOpen}
        initial={initial}
        onClose={close}
        onSaved={() => router.refresh()}
      />
    </>
  );
}
