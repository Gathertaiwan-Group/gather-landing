import { NextResponse } from "next/server";
import { clientIp } from "@/lib/gemini";
import { getContractByToken, signContractByToken } from "@/lib/contract";
import { createDepositForContract } from "@/lib/payment";
import { sendPaymentEmail, sendOwnerEventNotice } from "@/lib/resend";
import { moneyTWD } from "@/lib/quote";

// 公開端點：客人在 /contract/<token> 頁完成線上簽署時呼叫。
// middleware 只閘 /admin 與 /api/admin，這裡本來就公開。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gathertaiwan.com";

type SignBody = { token?: string; name?: string };

export async function POST(req: Request) {
  let body: SignBody;
  try {
    body = (await req.json()) as SignBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const token = String(body.token ?? "").trim();
  const name = String(body.name ?? "").trim().slice(0, 100);
  if (!token) {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!name) {
    // 擋空名：簽署人姓名必填。
    return NextResponse.json({ ok: false, error: "name_required" }, { status: 400 });
  }

  // 先看目前狀態：已簽者為「重複簽署」→ 回同結果但不重寄信、不重複通知。
  const cur = await getContractByToken(token);
  if (!cur || cur.status === "voided" || cur.status === "draft") {
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 410 });
  }
  const alreadySigned = cur.status === "signed";

  // 簽署（冪等：已簽回既有；僅 sent → signed 會寫入簽署人/IP/UA）。
  const ip = clientIp(req);
  const userAgent = req.headers.get("user-agent") ?? "";
  const contract = await signContractByToken(token, { name, ip, userAgent });
  if (!contract) {
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 410 });
  }

  // 建訂金請款單（冪等：同 quote/contract 已有 deposit 回既有）→ 寄請款信＋通知老闆。
  // 整段 try/catch：訂金/寄信失敗只記 log，不影響簽署成功的回應。
  let payToken: string | null = null;
  try {
    const deposit = await createDepositForContract(contract);
    payToken = deposit?.public_token ?? null;
    if (!deposit) {
      console.error("[contract/sign] 建立訂金請款單失敗（contract:", contract.id, "）");
    }

    if (!alreadySigned) {
      if (deposit) {
        await sendPaymentEmail(deposit).catch((err) => {
          console.error("[contract/sign] 寄訂金請款信失敗:", err);
        });
      }
      await sendOwnerEventNotice(
        `✍️ 合約已完成簽署：${contract.signer_name ?? contract.client_name ?? "客戶"}（${contract.contract_no ?? "—"}）`,
        [
          `簽署人：${contract.signer_name ?? "—"}`,
          `簽署 IP：${contract.signer_ip ?? "—"}`,
          deposit ? `訂金請款單：${deposit.payment_no ?? "—"}（${moneyTWD(deposit.amount)}）` : "⚠️ 訂金請款單建立失敗，請至後台手動處理",
          deposit?.public_token ? `付款連結：${SITE_URL}/pay/${deposit.public_token}` : "",
          contract.public_token ? `合約連結：${SITE_URL}/contract/${contract.public_token}` : "",
        ]
      ).catch((err) => {
        console.error("[contract/sign] 老闆通知寄送失敗:", err);
      });
    }
  } catch (err) {
    console.error("[contract/sign] 簽署後續流程失敗（不影響簽署回應）:", err);
  }

  return NextResponse.json({ ok: true, payToken });
}
