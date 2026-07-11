import { NextResponse } from "next/server";
import { getPaymentByToken, attachGatewayOrder } from "@/lib/payment";
import { pchomepayConfigured, genOrderNo, createGatewayCheckout } from "@/lib/pchomepay";
import { getQuote } from "@/lib/quote";

// 公開端點：/pay/<token> 頁的「前往付款」form POST 到這裡 → 建 PChomePay 訂單 → 303 導向付款頁。
// middleware 只閘 /admin 與 /api/admin，這裡本來就公開。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gathertaiwan.com";

/** 瀏覽器看得懂的繁中錯誤頁（form POST 的回應，不是 JSON API）。 */
function htmlMessage(status: number, title: string, message: string, backHref?: string): Response {
  const html = `<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><meta name="robots" content="noindex"/><title>${title} — 給樂數位 Gather</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Noto Sans TC',sans-serif;color:#1d1d1f;padding:24px">
<div style="max-width:420px;background:#fff;border-radius:24px;box-shadow:0 4px 30px rgba(20,40,80,.08);padding:36px 30px;text-align:center">
<h1 style="font-size:19px;margin:0 0 12px">${title}</h1>
<p style="font-size:14.5px;line-height:1.7;color:#6e6e73;margin:0 0 20px">${message}</p>
${backHref ? `<a href="${backHref}" style="color:#1668c2;font-size:14px;text-decoration:none">← 返回付款頁</a><br/>` : ""}
<a href="https://gathertaiwan.com/#contact" style="color:#1668c2;font-size:14px;text-decoration:none">聯絡我們</a>
</div></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function POST(req: Request) {
  // form-urlencoded {token}
  let token = "";
  try {
    const form = await req.formData();
    token = String(form.get("token") ?? "").trim();
  } catch {
    return htmlMessage(400, "無效的付款請求", "請從付款連結頁面重新操作。");
  }
  if (!token) {
    return htmlMessage(400, "無效的付款請求", "請從付款連結頁面重新操作。");
  }

  const payment = await getPaymentByToken(token);
  if (!payment) {
    return htmlMessage(404, "找不到這筆請款單", "付款連結可能有誤，請確認信件中的連結，或直接與我們聯繫。");
  }

  // 非 pending（已付款/已失效/已退款）→ 回付款頁看目前狀態（用本次請求的 host，本機測試也正確）。
  if (payment.status !== "pending") {
    return NextResponse.redirect(new URL(`/pay/${token}`, req.url), 303);
  }

  if (!pchomepayConfigured()) {
    return htmlMessage(
      503,
      "線上付款服務尚未開通",
      "目前暫時無法使用線上付款，請與我們聯繫改以銀行匯款方式付款，造成不便敬請見諒。",
      `/pay/${token}`
    );
  }

  // 我方訂單編號：已有就重用（同一筆請款重複進付款頁不重複產號），否則產號並綁定。
  let orderNo = payment.gateway_order_no;
  if (!orderNo) {
    orderNo = genOrderNo();
    const attached = await attachGatewayOrder(payment.id, orderNo);
    if (!attached) {
      console.error("[pay/checkout] attachGatewayOrder 失敗（payment:", payment.id, "）");
      return htmlMessage(502, "建立付款訂單失敗", "請稍後再試一次；若持續發生，請與我們聯繫。", `/pay/${token}`);
    }
  }

  // 買家 email：由請款單的來源報價撈聯絡信箱。
  let buyerEmail: string | undefined;
  if (payment.quote_id) {
    const quote = await getQuote(payment.quote_id);
    buyerEmail = quote?.contact_email ?? undefined;
  }

  const checkout = await createGatewayCheckout({
    orderNo,
    amount: Math.round(payment.amount),
    itemName: payment.title || payment.payment_no || "服務款項",
    returnUrl: `${SITE_URL}/pay/${token}?done=1`,
    notifyUrl: `${SITE_URL}/api/pay/pchomepay/notify`,
    buyerEmail,
  });
  if (!checkout) {
    return htmlMessage(502, "建立付款訂單失敗", "金流服務暫時無法使用，請稍後再試；若持續發生，請與我們聯繫。", `/pay/${token}`);
  }

  // 303：POST 後導向 GET（PChomePay 付款頁）。
  return NextResponse.redirect(checkout.paymentUrl, 303);
}
