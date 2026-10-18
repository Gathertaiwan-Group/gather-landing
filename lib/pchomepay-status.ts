// PChomePay 查單（GET /v1/payment/{order_id}）付款狀態判斷（純函式，無外部依賴，可直接用 node 驗證）。
//
// 權威付款狀態在 `status` 欄位："S" 成功、"F" 失敗、"P" 處理中；
// 成功時 `status_code` 通常是 null（只在特定失敗情境有值）。
// 舊版只讀 status_code，導致真實付款成功仍被當成未付。
// 依據：Realreal/apps/api/src/lib/pchomepay.ts（queryPayment 型別註解）與
//       Realreal/apps/api/src/routes/webhooks/pchomepay.ts（2026-07-12 事件：4 筆真實訂單因只認 status_code 卡在 pending）。
//
// 已付：status === "S"，或（相容既有行為）status_code ∈ {"S","00","1"}。
// 失敗：status === "F" 或 status_code === "F"。其餘（含 "P"、無法辨識）＝未付／處理中。

export const PAID_STATUS_CODES = ["S", "00", "1"];

export type PchomepayQueryState = "paid" | "failed" | "pending";

export function classifyPchomepayQuery(q: { status?: string | null; status_code?: string | null }): PchomepayQueryState {
  const status = String(q.status ?? "").trim().toUpperCase();
  const code = String(q.status_code ?? "").trim().toUpperCase();
  if (status === "S" || PAID_STATUS_CODES.includes(code)) return "paid";
  if (status === "F" || code === "F") return "failed";
  return "pending";
}
