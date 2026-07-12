// 用 Resend 寄信（新諮詢通知、報價相關）。
// env（RESEND_API_KEY / RESEND_FROM / CONTACT_NOTIFY_TO）未設 → 靜默略過，
// 不影響資料寫入。

import { getQuote, type Quote, type LineItem } from "@/lib/quote";
import { getContract, type Contract } from "@/lib/contract";
import { getCase, type ClientCase } from "@/lib/adminCases";
import { PAYMENT_KIND_LABELS, type Payment } from "@/lib/payment";
import type { Deliverable } from "@/lib/portal";

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

// ─────────────────────────────────────────────────────────────
// P0 錢的閉環：合約簽署／請款／開工／結案 Email
// ─────────────────────────────────────────────────────────────

const SIGNATURE = `<p style="font-size:12.5px;color:#86868b;margin:18px 0 0">有任何問題，直接回覆這封信即可。<br/>— 給樂數位 Gather</p>`;

/** 請款單收件人（Email／稱呼）：quote → contract → case 依序解析。 */
async function resolvePaymentRecipient(payment: Payment): Promise<{ email: string; name: string | null } | null> {
  try {
    if (payment.quote_id) {
      const q = await getQuote(payment.quote_id);
      if (q?.contact_email) return { email: q.contact_email, name: q.client_name };
    }
    if (payment.contract_id) {
      const c = await getContract(payment.contract_id);
      if (c?.contact_email) return { email: c.contact_email, name: c.client_name };
    }
    if (payment.case_id) {
      const k = await getCase(payment.case_id);
      if (k?.contact_email) return { email: k.contact_email, name: k.client_name };
    }
  } catch {
    /* fallthrough */
  }
  return null;
}

/** 請款單資訊表（款項／單號／金額）。 */
function paymentInfoTable(payment: Payment): string {
  const rows: Array<[string, string]> = [
    ["款項", payment.title ?? PAYMENT_KIND_LABELS[payment.kind]],
    ["單號", payment.payment_no ?? "—"],
    ["金額", money(payment.amount)],
  ];
  const html = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 14px 4px 0;color:#6e6e73;white-space:nowrap">${k}</td><td style="padding:4px 0;color:#1d1d1f"><b>${esc(v)}</b></td></tr>`
    )
    .join("");
  return `<table style="border-collapse:collapse;font-size:14px;margin:0 0 14px">${html}</table>`;
}

/** 寄「合約待簽署」給客人（→ /contract/<token>）。 */
export async function sendContractEmail(contract: Contract): Promise<boolean> {
  if (!contract.contact_email || !contract.public_token) return false;
  const url = `${SITE_URL}/contract/${contract.public_token}`;
  const hi = contract.client_name ? `${esc(contract.client_name)} 您好，` : "您好，";
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Noto Sans TC',sans-serif;max-width:560px;margin:0 auto">
    <h2 style="color:#1668c2;margin:0 0 4px;font-size:20px">給樂數位 服務合約 ${esc(contract.contract_no ?? "")}</h2>
    <p style="color:#1d1d1f;font-size:14.5px;line-height:1.7;margin:14px 0">${hi}感謝您接受我們的報價！我們已依報價內容為您準備好委託開發合約，請點下方按鈕閱讀全文並完成線上簽署：</p>
    <p style="text-align:center;margin:14px 0 18px">${quoteButton(url, "閱讀並簽署合約")}</p>
    <p style="color:#6e6e73;font-size:13px;line-height:1.7;margin:0">簽署完成後，我們會寄送訂金付款連結給您；收到訂金後即正式開工。</p>
    ${SIGNATURE}
  </div>`;
  return postEmail({
    to: contract.contact_email,
    subject: `請簽署：給樂數位服務合約 ${contract.contract_no ?? ""}`,
    html,
    replyTo: process.env.CONTACT_NOTIFY_TO,
  });
}

/** 寄「合約未簽提醒」給客人（cron 單次）。 */
export async function sendContractReminderEmail(contract: Contract): Promise<boolean> {
  if (!contract.contact_email || !contract.public_token) return false;
  const url = `${SITE_URL}/contract/${contract.public_token}`;
  const hi = contract.client_name ? `${esc(contract.client_name)} 您好，` : "您好，";
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Noto Sans TC',sans-serif;max-width:560px;margin:0 auto">
    <h2 style="color:#1668c2;margin:0 0 4px;font-size:19px">關於您的服務合約 ${esc(contract.contract_no ?? "")}</h2>
    <p style="color:#1d1d1f;font-size:14.5px;line-height:1.7;margin:14px 0">${hi}前陣子寄給您的合約還沒完成簽署，隨時歡迎點下方連結查看；若內容有想調整的地方，直接回信跟我們聊聊就好 🙂</p>
    <p style="text-align:center;margin:14px 0 18px">${quoteButton(url, "查看並簽署合約")}</p>
    <p style="font-size:12.5px;color:#86868b;margin:8px 0 0">— 給樂數位 Gather</p>
  </div>`;
  return postEmail({
    to: contract.contact_email,
    subject: `提醒：您的服務合約 ${contract.contract_no ?? ""} 待簽署`,
    html,
    replyTo: process.env.CONTACT_NOTIFY_TO,
  });
}

/** 寄「請款通知」給客人（文案依 kind；→ /pay/<token>）。 */
export async function sendPaymentEmail(payment: Payment): Promise<boolean> {
  if (!payment.public_token) return false;
  const rc = await resolvePaymentRecipient(payment);
  if (!rc) return false;
  const url = `${SITE_URL}/pay/${payment.public_token}`;
  const hi = rc.name ? `${esc(rc.name)} 您好，` : "您好，";
  const intro =
    payment.kind === "deposit"
      ? "合約已完成簽署！請支付簽約訂金，我們收到款項後即正式開工："
      : payment.kind === "final"
        ? "您的專案已開發完成，請驗收成果並支付尾款："
        : "附上您的付款資訊，請點下方按鈕完成付款：";
  const title = payment.title ?? PAYMENT_KIND_LABELS[payment.kind];
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Noto Sans TC',sans-serif;max-width:560px;margin:0 auto">
    <h2 style="color:#1668c2;margin:0 0 4px;font-size:20px">給樂數位 請款通知 ${esc(payment.payment_no ?? "")}</h2>
    <p style="color:#1d1d1f;font-size:14.5px;line-height:1.7;margin:14px 0">${hi}${intro}</p>
    ${paymentInfoTable(payment)}
    <p style="text-align:center;margin:14px 0 18px">${quoteButton(url, "前往付款")}</p>
    ${SIGNATURE}
  </div>`;
  return postEmail({
    to: rc.email,
    subject: `給樂數位 請款通知：${title} ${money(payment.amount)}`,
    html,
    replyTo: process.env.CONTACT_NOTIFY_TO,
  });
}

/** 寄「未付款提醒」給客人（cron 單次）。 */
export async function sendPaymentReminderEmail(payment: Payment): Promise<boolean> {
  if (!payment.public_token) return false;
  const rc = await resolvePaymentRecipient(payment);
  if (!rc) return false;
  const url = `${SITE_URL}/pay/${payment.public_token}`;
  const hi = rc.name ? `${esc(rc.name)} 您好，` : "您好，";
  const title = payment.title ?? PAYMENT_KIND_LABELS[payment.kind];
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Noto Sans TC',sans-serif;max-width:560px;margin:0 auto">
    <h2 style="color:#1668c2;margin:0 0 4px;font-size:19px">付款提醒：${esc(title)} ${esc(payment.payment_no ?? "")}</h2>
    <p style="color:#1d1d1f;font-size:14.5px;line-height:1.7;margin:14px 0">${hi}提醒您，這筆款項尚未完成付款；付款完成後流程就會自動接著走。若有任何疑問，直接回信跟我們說一聲就好 🙂</p>
    ${paymentInfoTable(payment)}
    <p style="text-align:center;margin:14px 0 18px">${quoteButton(url, "前往付款")}</p>
    <p style="font-size:12.5px;color:#86868b;margin:8px 0 0">— 給樂數位 Gather</p>
  </div>`;
  return postEmail({
    to: rc.email,
    subject: `提醒：${title} ${payment.payment_no ?? ""} 尚未付款`,
    html,
    replyTo: process.env.CONTACT_NOTIFY_TO,
  });
}

/** 寄「已收訂金、正式開工」給客人（portalUrl 有給就附客戶專屬進度頁連結；可選、向後相容）。 */
export async function sendWorkStartedEmail(payment: Payment, portalUrl?: string): Promise<boolean> {
  const rc = await resolvePaymentRecipient(payment);
  if (!rc) return false;
  const hi = rc.name ? `${esc(rc.name)} 您好，` : "您好，";
  const portalBlock = portalUrl
    ? `<p style="text-align:center;margin:14px 0 12px">${quoteButton(portalUrl, "查看專案進度")}</p>
    <p style="color:#6e6e73;font-size:13px;line-height:1.7;margin:0 0 10px">上方是您的專案專屬進度頁：開發期間的里程碑、最新動態與交付內容都會即時更新，也可以直接在頁面上留言給我們。</p>`
    : "";
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Noto Sans TC',sans-serif;max-width:560px;margin:0 auto">
    <h2 style="color:#1f7a44;margin:0 0 4px;font-size:20px">🚀 已收到訂金，專案正式開工！</h2>
    <p style="color:#1d1d1f;font-size:14.5px;line-height:1.7;margin:14px 0">${hi}我們已收到您的款項 <b>${money(payment.amount)}</b>（單號 ${esc(payment.payment_no ?? "—")}），專案正式啟動。接下來我們會依合約內容進行開發，過程中有需要確認的事項會隨時與您聯繫。</p>
    ${portalBlock}
    <p style="color:#6e6e73;font-size:13px;line-height:1.7;margin:0">開發完成後會通知您驗收，屆時再進行尾款結算。</p>
    ${SIGNATURE}
  </div>`;
  return postEmail({
    to: rc.email,
    subject: `已收到訂金，專案正式開工 🚀（${payment.payment_no ?? ""}）`,
    html,
    replyTo: process.env.CONTACT_NOTIFY_TO,
  });
}

/** 寄「結案感謝」給客人。 */
export async function sendClosingEmail(payment: Payment): Promise<boolean> {
  const rc = await resolvePaymentRecipient(payment);
  if (!rc) return false;
  const hi = rc.name ? `${esc(rc.name)} 您好，` : "您好，";
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Noto Sans TC',sans-serif;max-width:560px;margin:0 auto">
    <h2 style="color:#1f7a44;margin:0 0 4px;font-size:20px">🎉 專案圓滿結案，感謝您的信任！</h2>
    <p style="color:#1d1d1f;font-size:14.5px;line-height:1.7;margin:14px 0">${hi}我們已收到尾款 <b>${money(payment.amount)}</b>（單號 ${esc(payment.payment_no ?? "—")}），本案正式結案。謝謝您一路以來的配合與信任，能參與您的專案是我們的榮幸！</p>
    <p style="color:#6e6e73;font-size:13px;line-height:1.7;margin:0">日後系統若有任何問題或想再擴充功能，隨時回信找我們；也歡迎把給樂數位介紹給有需要的朋友 🙂</p>
    ${SIGNATURE}
  </div>`;
  return postEmail({
    to: rc.email,
    subject: `專案結案通知與感謝 🎉（${payment.payment_no ?? ""}）`,
    html,
    replyTo: process.env.CONTACT_NOTIFY_TO,
  });
}

// ─────────────────────────────────────────────────────────────
// P1 客戶專案入口：留言／回覆／交付物通知 Email
// ─────────────────────────────────────────────────────────────

/** 通知「老闆」客戶在 portal 留言（含後台案件連結；reply_to 設客人 Email 方便直接回信）。 */
export async function sendPortalCommentNotice(caseRow: ClientCase, body: string): Promise<boolean> {
  const to = process.env.CONTACT_NOTIFY_TO;
  if (!to) return false;
  const adminUrl = `${SITE_URL}/admin/cases/${caseRow.id}`;
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Noto Sans TC',sans-serif;max-width:560px;margin:0 auto">
    <h2 style="color:#1668c2;margin:0 0 4px;font-size:20px">💬 客戶留言：${esc(caseRow.client_name)}</h2>
    <p style="color:#86868b;margin:0 0 14px;font-size:13px">案件：${esc(caseRow.title)}</p>
    <div style="white-space:pre-wrap;color:#1d1d1f;background:#f5f5f7;border-radius:10px;padding:12px 14px;font-size:14px;line-height:1.7">${esc(body)}</div>
    <p style="margin:16px 0 0;font-size:13px;color:#86868b">到後台回覆 → <a href="${adminUrl}" style="color:#1668c2">${adminUrl.replace("https://", "")}</a></p>
  </div>`;
  return postEmail({
    to,
    subject: `💬 客戶留言：${caseRow.client_name}（${caseRow.title}）`,
    html,
    replyTo: caseRow.contact_email,
  });
}

/** 通知「客人」老闆回覆了專案動態（含 portal 連結）。客人沒 Email → false。 */
export async function sendOwnerReplyNotice(caseRow: ClientCase, body: string, portalUrl: string): Promise<boolean> {
  if (!caseRow.contact_email) return false;
  const hi = caseRow.client_name ? `${esc(caseRow.client_name)} 您好，` : "您好，";
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Noto Sans TC',sans-serif;max-width:560px;margin:0 auto">
    <h2 style="color:#1668c2;margin:0 0 4px;font-size:20px">📮 專案進度回覆</h2>
    <p style="color:#1d1d1f;font-size:14.5px;line-height:1.7;margin:14px 0">${hi}您的專案「${esc(caseRow.title)}」有一則新回覆：</p>
    <div style="white-space:pre-wrap;color:#1d1d1f;background:#f5f5f7;border-radius:10px;padding:12px 14px;font-size:14px;line-height:1.7">${esc(body)}</div>
    <p style="text-align:center;margin:16px 0 18px">${quoteButton(portalUrl, "查看專案進度")}</p>
    ${SIGNATURE}
  </div>`;
  return postEmail({
    to: caseRow.contact_email,
    subject: `專案進度回覆：${caseRow.title}`,
    html,
    replyTo: process.env.CONTACT_NOTIFY_TO,
  });
}

/** 通知「客人」有新交付物待驗收（含 portal 連結；is_final 會提示驗收通過即進入尾款結算）。 */
export async function sendDeliverableNotice(caseRow: ClientCase, deliverable: Deliverable, portalUrl: string): Promise<boolean> {
  if (!caseRow.contact_email) return false;
  const hi = caseRow.client_name ? `${esc(caseRow.client_name)} 您好，` : "您好，";
  const finalNote = deliverable.is_final
    ? "；這是本案的<b>最終交付</b>，驗收通過後我們就會進行尾款結算"
    : "";
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Noto Sans TC',sans-serif;max-width:560px;margin:0 auto">
    <h2 style="color:#1668c2;margin:0 0 4px;font-size:20px">📦 新交付物待驗收：${esc(deliverable.title)}</h2>
    <p style="color:#1d1d1f;font-size:14.5px;line-height:1.7;margin:14px 0">${hi}您的專案「${esc(caseRow.title)}」有新的交付內容，請點下方按鈕查看並進行驗收${finalNote}：</p>
    <p style="text-align:center;margin:14px 0 18px">${quoteButton(portalUrl, "查看並驗收")}</p>
    <p style="color:#6e6e73;font-size:13px;line-height:1.7;margin:0">若有需要調整的地方，也可以在頁面上選「要求修改」並留下意見，我們會盡快處理。</p>
    ${SIGNATURE}
  </div>`;
  return postEmail({
    to: caseRow.contact_email,
    subject: `📦 交付物待驗收：${deliverable.title}`,
    html,
    replyTo: process.env.CONTACT_NOTIFY_TO,
  });
}

/** 通用事件通知給「老闆」（to CONTACT_NOTIFY_TO；lines 逐行列點，空字串自動略過）。 */
export async function sendOwnerEventNotice(subject: string, lines: string[]): Promise<boolean> {
  const to = process.env.CONTACT_NOTIFY_TO;
  if (!to) return false;
  const items = (lines ?? [])
    .filter((l) => !!l && l.trim())
    .map((l) => `<li style="margin:3px 0;color:#1d1d1f">${esc(l)}</li>`)
    .join("");
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Noto Sans TC',sans-serif;max-width:520px;margin:0 auto">
    <h2 style="color:#1668c2;margin:0 0 10px;font-size:19px">${esc(subject)}</h2>
    ${items ? `<ul style="font-size:14px;line-height:1.7;padding-left:18px;margin:0 0 14px">${items}</ul>` : ""}
    <p style="margin:14px 0 0;font-size:13px;color:#86868b">到後台查看 → <a href="${SITE_URL}/admin" style="color:#1668c2">${SITE_URL.replace("https://", "")}/admin</a></p>
  </div>`;
  return postEmail({ to, subject, html });
}
