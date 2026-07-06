// 用 Resend 寄信（新諮詢通知、報價相關）。
// env（RESEND_API_KEY / RESEND_FROM / CONTACT_NOTIFY_TO）未設 → 靜默略過，
// 不影響資料寫入。

import type { Quote, LineItem } from "@/lib/quote";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gathertaiwan.com";

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

// ─────────────────────────────────────────────────────────────
// 報價單相關 Email
// ─────────────────────────────────────────────────────────────

/** 低階寄信（讀 RESEND env）；未設 / 失敗回 false。 */
async function postEmail(opts: { to: string; subject: string; html: string; replyTo?: string | null }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!key || !from || !opts.to) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [opts.to], subject: opts.subject, html: opts.html, reply_to: opts.replyTo || undefined }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function money(n: number | null | undefined): string {
  return `NT$${(Number(n) || 0).toLocaleString("en-US")}`;
}

function lineItemsTable(items: LineItem[]): string {
  const rows = (items || [])
    .map(
      (it) =>
        `<tr><td style="padding:8px 10px;border-bottom:1px solid #eee">${esc(it.description)}</td><td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:center;white-space:nowrap">${it.qty}</td><td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${money(it.unit_price)}</td><td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${money(it.amount)}</td></tr>`
    )
    .join("");
  return `<table style="border-collapse:collapse;width:100%;font-size:14px;margin:8px 0 14px">
    <tr style="color:#6e6e73;font-size:12px"><th style="text-align:left;padding:6px 10px">項目</th><th style="padding:6px 10px">數量</th><th style="text-align:right;padding:6px 10px">單價</th><th style="text-align:right;padding:6px 10px">小計</th></tr>
    ${rows}
  </table>`;
}

function quoteButton(url: string, label: string): string {
  return `<a href="${url}" style="display:inline-block;background:#1668c2;color:#fff;text-decoration:none;padding:12px 26px;border-radius:980px;font-weight:600;font-size:15px">${label}</a>`;
}

/** 寄報價給「客人」（含 /quote/<token> 連結）。 */
export async function sendQuoteEmail(quote: Quote): Promise<boolean> {
  if (!quote.contact_email || !quote.public_token) return false;
  const url = `${SITE_URL}/quote/${quote.public_token}`;
  const hi = quote.client_name ? `${esc(quote.client_name)} 您好，` : "您好，";
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Noto Sans TC',sans-serif;max-width:560px;margin:0 auto">
    <h2 style="color:#1668c2;margin:0 0 4px;font-size:20px">給樂數位 報價單 ${esc(quote.quote_no ?? "")}</h2>
    <p style="color:#1d1d1f;font-size:14.5px;line-height:1.7;margin:14px 0">${hi}謝謝您的洽詢，附上依您需求整理的初步報價：</p>
    ${lineItemsTable(quote.line_items)}
    <p style="text-align:right;font-size:16px;color:#1d1d1f;margin:0 0 18px"><b>總計：${money(quote.total)}</b></p>
    <p style="text-align:center;margin:8px 0 18px">${quoteButton(url, "查看完整報價")}</p>
    ${quote.notes ? `<div style="font-size:13px;color:#6e6e73;background:#f5f5f7;border-radius:10px;padding:12px 14px;white-space:pre-wrap">${esc(quote.notes)}</div>` : ""}
    <p style="font-size:12.5px;color:#86868b;margin:18px 0 0">此為初步報價，實際內容可再依需求討論調整。有任何問題，直接回覆這封信即可。<br/>— 給樂數位 Gather</p>
  </div>`;
  return postEmail({
    to: quote.contact_email,
    subject: `給樂數位 報價單 ${quote.quote_no ?? ""}`,
    html,
    replyTo: process.env.CONTACT_NOTIFY_TO,
  });
}

/** 寄單次跟進提醒給「客人」。 */
export async function sendQuoteReminderEmail(quote: Quote): Promise<boolean> {
  if (!quote.contact_email || !quote.public_token) return false;
  const url = `${SITE_URL}/quote/${quote.public_token}`;
  const hi = quote.client_name ? `${esc(quote.client_name)} 您好，` : "您好，";
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Noto Sans TC',sans-serif;max-width:560px;margin:0 auto">
    <h2 style="color:#1668c2;margin:0 0 4px;font-size:19px">關於您的報價單 ${esc(quote.quote_no ?? "")}</h2>
    <p style="color:#1d1d1f;font-size:14.5px;line-height:1.7;margin:14px 0">${hi}前陣子提供給您的報價，不知道還有沒有想了解的地方？隨時歡迎點下方看看，或直接回信跟我們聊聊需求 🙂</p>
    <p style="text-align:center;margin:14px 0 18px">${quoteButton(url, "查看報價")}</p>
    <p style="font-size:12.5px;color:#86868b;margin:8px 0 0">— 給樂數位 Gather</p>
  </div>`;
  return postEmail({
    to: quote.contact_email,
    subject: `跟進：您的報價單 ${quote.quote_no ?? ""}`,
    html,
    replyTo: process.env.CONTACT_NOTIFY_TO,
  });
}

/** 通知「老闆」有 AI 報價草稿待審。 */
export async function sendQuoteDraftNotice(quote: Quote): Promise<boolean> {
  const to = process.env.CONTACT_NOTIFY_TO;
  if (!to) return false;
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Noto Sans TC',sans-serif;max-width:520px;margin:0 auto">
    <h2 style="color:#1668c2;margin:0 0 8px;font-size:20px">🧾 有一張 AI 報價草稿待審</h2>
    <table style="border-collapse:collapse;font-size:14px;margin-bottom:12px">
      <tr><td style="padding:4px 14px 4px 0;color:#6e6e73">客戶</td><td><b>${esc(quote.client_name ?? "—")}</b></td></tr>
      <tr><td style="padding:4px 14px 4px 0;color:#6e6e73">Email</td><td>${esc(quote.contact_email ?? "—")}</td></tr>
      <tr><td style="padding:4px 14px 4px 0;color:#6e6e73">金額</td><td><b>${money(quote.total)}</b></td></tr>
    </table>
    <p style="margin:14px 0 0;font-size:13px;color:#86868b">到後台審核並寄出 → <a href="${SITE_URL}/admin/quotes" style="color:#1668c2">${SITE_URL.replace("https://", "")}/admin/quotes</a></p>
  </div>`;
  return postEmail({ to, subject: `🧾 AI 報價草稿待審：${quote.client_name ?? ""}`, html });
}

/** 通知「老闆」客人接受了報價。 */
export async function sendQuoteAcceptedNotice(quote: Quote): Promise<boolean> {
  const to = process.env.CONTACT_NOTIFY_TO;
  if (!to) return false;
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Noto Sans TC',sans-serif;max-width:520px;margin:0 auto">
    <h2 style="color:#1f7a44;margin:0 0 8px;font-size:20px">🎉 客人接受了報價！</h2>
    <table style="border-collapse:collapse;font-size:14px;margin-bottom:12px">
      <tr><td style="padding:4px 14px 4px 0;color:#6e6e73">報價單</td><td><b>${esc(quote.quote_no ?? "—")}</b></td></tr>
      <tr><td style="padding:4px 14px 4px 0;color:#6e6e73">客戶</td><td><b>${esc(quote.client_name ?? "—")}</b></td></tr>
      <tr><td style="padding:4px 14px 4px 0;color:#6e6e73">Email</td><td>${esc(quote.contact_email ?? "—")}</td></tr>
      <tr><td style="padding:4px 14px 4px 0;color:#6e6e73">金額</td><td><b>${money(quote.total)}</b></td></tr>
    </table>
    <p style="margin:14px 0 0;font-size:13px;color:#86868b">趕快跟進 → <a href="${SITE_URL}/admin/quotes" style="color:#1668c2">${SITE_URL.replace("https://", "")}/admin/quotes</a></p>
  </div>`;
  return postEmail({ to, subject: `🎉 報價已被接受：${quote.client_name ?? ""}（${quote.quote_no ?? ""}）`, html });
}
