import { createAdminSupabase } from "@/lib/supabase";
import { markPaymentPaid, recordAtmInfo, type Payment } from "@/lib/payment";
import { queryGatewayPayment } from "@/lib/pchomepay";
import { handlePaymentPaid } from "@/lib/lifecycle";
import { sendOwnerEventNotice } from "@/lib/resend";
import { moneyTWD } from "@/lib/quote";

// PChomePay webhook（天生公開、不驗 CRON_SECRET、不在 middleware）。
// ⚠️ notify 無簽章 → 一律不信任 notify 內容，以 queryGatewayPayment 回查為權威；
//    金額比對通過才標記付款；只有 pending→paid 真的轉換（transitioned）才跑副作用。
// 回應約定：處理完成一律 HTTP 200 純文字 "success"（PChomePay 據此停止重試）；
//           回查失敗／內部錯誤回 500（讓 PChomePay 重試）。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAYMENT_SELECT =
  "id, payment_no, case_id, quote_id, contract_id, kind, title, amount, status, method, public_token, gateway_order_no, gateway_trade_no, atm_bank_code, atm_v_account, atm_expire_date, paid_at, reminded_at, created_at, updated_at";

function successText(): Response {
  return new Response("success", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

function retryText(): Response {
  // 500 → PChomePay 會重送 notify。
  return new Response("retry", { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

/** 以我方閘道訂單編號找請款單（lib/payment.ts 沒有此 getter，這裡自查）。 */
async function getPaymentByGatewayOrderNo(orderNo: string): Promise<Payment | null> {
  const supabase = createAdminSupabase();
  if (!supabase || !orderNo) return null;
  try {
    const { data, error } = await supabase
      .from("payments")
      .select(PAYMENT_SELECT)
      .eq("gateway_order_no", orderNo)
      .maybeSingle();
    if (error || !data) return null;
    return data as Payment;
  } catch {
    return null;
  }
}

/** payment_info 防禦性抽字串（鍵名不保證，逐一嘗試；數字也轉字串）。 */
function pickString(obj: Record<string, unknown> | undefined, keys: string[]): string {
  if (!obj) return "";
  for (const k of keys) {
    const v = obj[k];
    if (v != null && (typeof v === "string" || typeof v === "number")) {
      const s = String(v).trim();
      if (s) return s;
    }
  }
  return "";
}

export async function POST(req: Request) {
  try {
    // form-urlencoded：notify_type ＋ notify_message（JSON 字串）。
    let notifyType = "";
    let notifyMessage = "";
    try {
      const rawBody = await req.text();
      const sp = new URLSearchParams(rawBody);
      notifyType = (sp.get("notify_type") ?? "").trim();
      notifyMessage = sp.get("notify_message") ?? "";
    } catch (err) {
      console.error("[pay/notify] 讀取 body 失敗:", err);
      return successText(); // 格式不對重送也不會變好 → 回 success 停止重試
    }

    let msg: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(notifyMessage) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) msg = parsed as Record<string, unknown>;
    } catch {
      /* notify_message 非 JSON：下方以 orderId 缺失處理 */
    }
    const orderId = String(msg.order_id ?? "").trim();
    if (!notifyType || !orderId) {
      console.error("[pay/notify] notify 缺 notify_type/order_id，略過。type:", notifyType, "message:", notifyMessage.slice(0, 300));
      return successText();
    }

    const payment = await getPaymentByGatewayOrderNo(orderId);
    if (!payment) {
      console.error("[pay/notify] 找不到對應請款單（gateway_order_no:", orderId, "），略過。");
      return successText();
    }

    // 權威回查（notify 無簽章，不可信）——失敗回 500 讓 PChomePay 重試。
    const query = await queryGatewayPayment(orderId);
    if (!query) {
      console.error("[pay/notify] 回查閘道失敗（order:", orderId, "），回 500 待重試。");
      return retryText();
    }

    const rawResponse = { notify: { notify_type: notifyType, message: msg }, query };

    // ── 分支 1：權威已付款——回查 status_code 達 paid 即標記。
    //    notify_type 無簽章、不可信，因此對「標記付款」沒有否決權（只影響 ATM 取號等輔助分支）。
    const authoritativePaid = ["S", "00", "1"].includes(String(query.status_code ?? ""));
    if (authoritativePaid) {
      // 權威回應缺 amount → 無法比對，回 500 讓閘道重試（寧可重試也不能靜默漏掉真成交）。
      if (query.amount == null || !Number.isFinite(Number(query.amount))) {
        console.error(
          `[pay/notify] 權威已付但缺 amount，無法比對金額，回 500 待重試。payment=${payment.id} no=${payment.payment_no} order=${orderId}`
        );
        return retryText();
      }
      // 金額比對：round(權威 amount) === round(payment.amount)，不符不標記（但回 success 停止重試）。
      const authoritative = Math.round(Number(query.amount));
      const expected = Math.round(Number(payment.amount) || 0);
      if (authoritative !== expected) {
        console.error(
          `[pay/notify] 金額不符，不標記付款！payment=${payment.id} no=${payment.payment_no} order=${orderId} 期望=${expected} 權威=${String(query.amount)}`
        );
        return successText();
      }

      const method = (query.pay_type ?? "").toUpperCase().includes("CARD") ? "pchomepay_credit" : "pchomepay_atm";
      const marked = await markPaymentPaid(payment.id, {
        method,
        gateway_trade_no: orderId,
        raw_response: rawResponse,
      });
      if (!marked) {
        console.error("[pay/notify] markPaymentPaid 失敗（payment:", payment.id, "），回 500 待重試。");
        return retryText();
      }

      if (marked.transitioned) {
        // 恰好一次：搶到 pending→paid 轉換的這一次才跑副作用（自動開案/結案＋信件）。
        await handlePaymentPaid(payment.id);
      } else if (marked.payment.status === "failed") {
        // 錢對不上帳的唯一暗角：請款單已被作廢（如完工建尾款時作廢未付訂金），
        // 但錢實際在閘道入帳了 → 一定要讓老闆看見並處理退款。
        console.error(
          `[pay/notify] ⚠️ 已作廢的請款單收到入帳通知！payment=${payment.id} no=${payment.payment_no} order=${orderId} amount=${payment.amount} notify_type=${notifyType} status_code=${String(query.status_code)}（錢已在閘道入帳、帳上單已作廢，需人工退款）`
        );
        await sendOwnerEventNotice("⚠️ 已作廢的請款單收到入帳通知", [
          `請款單號：${payment.payment_no ?? "—"}`,
          `金額：${moneyTWD(payment.amount)}`,
          `閘道訂單編號：${orderId}`,
          "請至 PChomePay 後台確認並辦理退款",
        ]).catch((err) => {
          console.error("[pay/notify] 老闆警示信寄送失敗:", err);
        });
      }
      // transitioned===false 且已是 paid：重複 notify，冪等略過。
      return successText();
    }

    // ── 分支 2：ATM 取號（order_confirm 但權威 status_code 未達 paid）──
    if (notifyType === "order_confirm") {
      if (payment.status === "pending") {
        const info = query.payment_info;
        const bankCode = pickString(info, ["bank_code", "atm_bank_code", "bankCode", "bank_id", "bank"]);
        const vAccount = pickString(info, ["virt_account", "v_account", "atm_virt_account", "virtAccount", "vaccount", "account", "account_no"]);
        const expireDate = pickString(info, ["expire_date", "expired_date", "pay_expire_date", "expireDate", "expired_at", "expire_time"]);
        await recordAtmInfo(payment.id, { bankCode, vAccount, expireDate, raw: rawResponse });
        console.log(`[pay/notify] ATM 取號記錄（payment=${payment.id} bank=${bankCode} vAccount=${vAccount} expire=${expireDate}）`);
      }
      return successText();
    }

    // ── 分支 3：失效（order_expired 或權威 status_code === "F"）→ 僅 pending → failed ──
    if (notifyType === "order_expired" || query.status_code === "F") {
      if (payment.status === "pending") {
        const supabase = createAdminSupabase();
        if (supabase) {
          const { error } = await supabase
            .from("payments")
            .update({ status: "failed", raw_response: rawResponse, updated_at: new Date().toISOString() })
            .eq("id", payment.id)
            .eq("status", "pending"); // 條件式：併發下已轉 paid 就不覆蓋
          if (error) console.error("[pay/notify] 標記 failed 失敗:", error.message);
          else console.log(`[pay/notify] 請款單標記失效（payment=${payment.id} notify_type=${notifyType}）`);
        }
      }
      return successText();
    }

    // ── 分支 4：其他（refund_* / order_audit …）→ 只記錄 ──
    console.log(`[pay/notify] 未處理的 notify_type=${notifyType}（order=${orderId} status_code=${String(query.status_code)}），僅記錄。`);
    return successText();
  } catch (err) {
    console.error("[pay/notify] 處理失敗（回 500 待重試）:", err);
    return retryText();
  }
}
