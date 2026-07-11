import { randomBytes } from "node:crypto";

// PChomePay 支付連 付款閘道模組（零新套件，一律用 fetch）。
// env：PCHOMEPAY_APP_ID / PCHOMEPAY_SECRET / PCHOMEPAY_SANDBOX（"true"=測試環境）/
//      PCHOMEPAY_PAY_TYPES（逗號分隔，預設 "CARD,ATM"）
// ⚠️ notify 無簽章：webhook 不可信任 notify 內容，一律以 queryGatewayPayment 回查為權威。

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gathertaiwan.com";

function baseUrl(): string {
  return process.env.PCHOMEPAY_SANDBOX === "true"
    ? "https://sandbox-api.pchomepay.com.tw"
    : "https://api.pchomepay.com.tw";
}

/** PCHOMEPAY_APP_ID / PCHOMEPAY_SECRET 是否齊全。 */
export function pchomepayConfigured(): boolean {
  return !!(process.env.PCHOMEPAY_APP_ID && process.env.PCHOMEPAY_SECRET);
}

/** 我方閘道訂單編號：GT＋時間（base36）＋6 碼隨機，英數、長度 16 ≤ 20。 */
export function genOrderNo(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const ALPHANUM = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 去易混淆字元
  const buf = randomBytes(6);
  let rand = "";
  for (let i = 0; i < buf.length; i++) rand += ALPHANUM[buf[i] % ALPHANUM.length];
  return `GT${ts}${rand}`.slice(0, 20);
}

// ── token 換發＋模組記憶體快取 ──
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string | null> {
  if (!pchomepayConfigured()) return null;
  const now = Date.now();
  // 有效期需 > now + 60s 才重用，避免臨界過期。
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.token;

  const appId = process.env.PCHOMEPAY_APP_ID ?? "";
  const secret = process.env.PCHOMEPAY_SECRET ?? "";
  try {
    const res = await fetch(`${baseUrl()}/v1/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${appId}:${secret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) {
      console.error("[pchomepay] token 換發失敗:", res.status, text.slice(0, 300));
      return null;
    }
    const data = JSON.parse(text) as { token?: string; expired_timestamp?: number };
    if (!data.token) {
      console.error("[pchomepay] token 回應缺 token:", text.slice(0, 300));
      return null;
    }
    // expired_timestamp 為 unix 秒；缺值視為 25 分鐘後過期。
    const expiresAt = Number(data.expired_timestamp) > 0 ? Number(data.expired_timestamp) * 1000 : now + 25 * 60_000;
    cachedToken = { token: data.token, expiresAt };
    return data.token;
  } catch (err) {
    console.error("[pchomepay] token 換發連線失敗:", err);
    return null;
  }
}

/** 帶 pcpay-token 呼叫 API；401 時清 token 快取重換一次再試。失敗回 null。 */
async function pcpayFetch(path: string, init: { method: "GET" | "POST"; body?: string }): Promise<Response | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getToken();
    if (!token) return null;
    try {
      const res = await fetch(`${baseUrl()}${path}`, {
        method: init.method,
        headers: { "pcpay-token": token, "Content-Type": "application/json" },
        body: init.body,
        cache: "no-store",
      });
      if (res.status === 401 && attempt === 0) {
        cachedToken = null; // token 失效 → 清快取重換
        continue;
      }
      return res;
    } catch (err) {
      console.error("[pchomepay] API 連線失敗:", err);
      return null;
    }
  }
  return null;
}

/**
 * 建單（POST /v1/payment）→ 回 PChomePay 付款頁 URL。
 * 未設定憑證或任何失敗一律回 null 並 console.error（呼叫端顯示繁中錯誤文案）。
 */
export async function createGatewayCheckout(input: {
  orderNo: string;
  amount: number;
  itemName: string;
  returnUrl: string;
  notifyUrl: string;
  buyerEmail?: string;
}): Promise<{ paymentUrl: string } | null> {
  if (!pchomepayConfigured()) {
    console.error("[pchomepay] 未設定 PCHOMEPAY_APP_ID/PCHOMEPAY_SECRET，無法建單");
    return null;
  }
  try {
    const payTypes = (process.env.PCHOMEPAY_PAY_TYPES || "CARD,ATM")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const body = JSON.stringify({
      order_id: input.orderNo,
      pay_type: payTypes.length > 0 ? payTypes : ["CARD", "ATM"],
      amount: Math.round(Number(input.amount) || 0),
      return_url: input.returnUrl,
      notify_url: input.notifyUrl,
      items: [{ name: String(input.itemName || "服務款項").slice(0, 100), url: SITE_URL }],
      buyer_email: input.buyerEmail || process.env.CONTACT_NOTIFY_TO || undefined,
      atm_info: { expire_days: 3 },
    });
    const res = await pcpayFetch("/v1/payment", { method: "POST", body });
    if (!res) return null;
    const text = await res.text();
    if (!res.ok) {
      console.error("[pchomepay] 建單失敗:", res.status, text.slice(0, 300));
      return null;
    }
    const data = JSON.parse(text) as { order_id?: string; payment_url?: string };
    if (!data.payment_url) {
      console.error("[pchomepay] 建單回應缺 payment_url:", text.slice(0, 300));
      return null;
    }
    return { paymentUrl: data.payment_url };
  } catch (err) {
    console.error("[pchomepay] createGatewayCheckout failed:", err);
    return null;
  }
}

/**
 * 查單（GET /v1/payment/{orderNo}）——notify 驗證的權威來源。
 * 失敗回 null（呼叫端應回 500 讓 PChomePay 重試）。
 */
export async function queryGatewayPayment(
  orderNo: string
): Promise<{ status_code?: string; pay_type?: string; amount?: number; payment_info?: Record<string, unknown> } | null> {
  if (!pchomepayConfigured() || !orderNo) return null;
  try {
    const res = await pcpayFetch(`/v1/payment/${encodeURIComponent(orderNo)}`, { method: "GET" });
    if (!res) return null;
    const text = await res.text();
    if (!res.ok) {
      console.error("[pchomepay] 查單失敗:", res.status, text.slice(0, 300));
      return null;
    }
    const data = JSON.parse(text) as Record<string, unknown>;
    // 防禦性正規化：status_code/pay_type 可能是數字或陣列。
    const statusCode = data.status_code != null ? String(data.status_code) : undefined;
    const payType = Array.isArray(data.pay_type)
      ? data.pay_type.map(String).join(",")
      : data.pay_type != null
        ? String(data.pay_type)
        : undefined;
    return {
      status_code: statusCode,
      pay_type: payType,
      amount: data.amount != null && Number.isFinite(Number(data.amount)) ? Number(data.amount) : undefined,
      payment_info:
        data.payment_info && typeof data.payment_info === "object" && !Array.isArray(data.payment_info)
          ? (data.payment_info as Record<string, unknown>)
          : undefined,
    };
  } catch (err) {
    console.error("[pchomepay] queryGatewayPayment failed:", err);
    return null;
  }
}

/** 是否為「已付款」狀態：notify_type ∈ {order_paid, order_confirm} 且 status_code ∈ {"S","00","1"}。 */
export function isPaidStatus(notifyType: string, statusCode?: string): boolean {
  const typeOk = notifyType === "order_paid" || notifyType === "order_confirm";
  const codeOk = statusCode === "S" || statusCode === "00" || statusCode === "1";
  return typeOk && codeOk;
}
