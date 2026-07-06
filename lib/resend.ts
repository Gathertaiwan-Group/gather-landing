// 用 Resend 寄「新諮詢通知」給老闆。
// env（RESEND_API_KEY / RESEND_FROM / CONTACT_NOTIFY_TO）未設 → 靜默略過，
// 不影響表單／對話的資料寫入。

export type InquiryNotice = {
  name: string;
  email?: string | null;
  phone?: string | null;
  line?: string | null;
  message?: string | null; // 表單訊息
  summary?: string | null; // AI 對話需求摘要
  source: string; // 'website' | 'ai_chat'
};

const SOURCE_LABEL: Record<string, string> = {
  website: "網站聯絡表單",
  ai_chat: "AI 客服對話",
};

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}

/**
 * 寄新諮詢通知給老闆。回傳是否成功寄出（未設 env／失敗 → false，呼叫端可忽略）。
 */
export async function sendInquiryNotification(inq: InquiryNotice): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM; // 例：給樂數位 <noreply@gathertaiwan.com>
  const to = process.env.CONTACT_NOTIFY_TO; // 例：gathertaiwan@gmail.com
  if (!key || !from || !to) return false;

  const label = SOURCE_LABEL[inq.source] ?? inq.source;
  const infoRows: Array<[string, string | null | undefined]> = [
    ["姓名", inq.name],
    ["Email", inq.email],
    ["電話", inq.phone],
    ["LINE", inq.line],
    ["來源", label],
  ];
  const infoHtml = infoRows
    .filter(([, v]) => v)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 14px 4px 0;color:#6e6e73;white-space:nowrap">${k}</td><td style="padding:4px 0;color:#1d1d1f"><b>${esc(
          String(v)
        )}</b></td></tr>`
    )
    .join("");

  const body = inq.summary || inq.message || "";
  const bodyLabel = inq.source === "ai_chat" ? "需求摘要" : "訊息";

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Noto Sans TC',sans-serif;max-width:520px;margin:0 auto">
    <h2 style="color:#1668c2;margin:0 0 2px;font-size:20px">📥 新諮詢（${esc(label)}）</h2>
    <p style="color:#86868b;margin:0 0 16px;font-size:13px">來自 gathertaiwan.com</p>
    <table style="border-collapse:collapse;font-size:14px;margin-bottom:14px">${infoHtml}</table>
    ${
      body
        ? `<div style="font-size:14px"><div style="color:#6e6e73;margin-bottom:5px">${bodyLabel}</div><div style="white-space:pre-wrap;color:#1d1d1f;background:#f5f5f7;border-radius:10px;padding:12px 14px">${esc(
            body
          )}</div></div>`
        : ""
    }
    <p style="margin:20px 0 0;font-size:13px;color:#86868b">到後台看更多 → <a href="https://gathertaiwan.com/admin" style="color:#1668c2">gathertaiwan.com/admin</a></p>
  </div>`;

  const subject = `📥 新諮詢：${inq.name}${inq.source === "ai_chat" ? "（AI 客服）" : ""}`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
        reply_to: inq.email || undefined, // 讓老闆能直接回信給客人
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
