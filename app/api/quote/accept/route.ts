import { NextResponse } from "next/server";
import { acceptQuoteByToken, moneyTWD } from "@/lib/quote";
import { createContractFromQuote, getContractByQuoteId } from "@/lib/contract";
import { sendQuoteAcceptedNotice, sendContractEmail, sendOwnerEventNotice } from "@/lib/resend";

// 公開端點：客人在 /quote/<token> 頁按「接受報價」時呼叫。
// middleware 只閘 /admin 與 /api/admin，這裡本來就公開。
export const runtime = "nodejs";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gathertaiwan.com";

type AcceptBody = { token?: string };

export async function POST(req: Request) {
  let body: AcceptBody;
  try {
    body = (await req.json()) as AcceptBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const token = (body.token ?? "").trim();
  if (!token) {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  // 未接受且未過期 → 設 accepted 並回 Quote；已接受回原 Quote；過期／找不到回 null。
  const quote = await acceptQuoteByToken(token);
  if (!quote) {
    // 過期或不存在：報價已無法接受。
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 410 });
  }

  // 通知老闆有人接受了報價（env 未設 / 失敗都不阻塞回應）。
  void sendQuoteAcceptedNotice(quote).catch(() => {});

  // ── P0 錢的閉環：接受後自動產合約＋寄簽署信＋通知老闆。
  // 冪等：該 quote 已有合約就整段跳過（重複接受不重複產、不重寄）。
  // 整段 try/catch：合約產生／寄信失敗一律只記 log，不影響原本的接受回應。
  try {
    const existing = await getContractByQuoteId(quote.id);
    if (!existing) {
      const contract = await createContractFromQuote(quote);
      if (contract) {
        await sendContractEmail(contract);
        await sendOwnerEventNotice(
          `📝 合約已自動寄出待簽：${contract.client_name ?? "客戶"}（${contract.contract_no ?? "—"}）`,
          [
            `報價單：${quote.quote_no ?? "—"}`,
            `金額：${moneyTWD(quote.total)}`,
            contract.public_token ? `合約連結：${SITE_URL}/contract/${contract.public_token}` : "",
          ]
        );
      } else {
        console.error("[quote/accept] 自動產合約失敗（quote:", quote.id, "）");
      }
    }
  } catch (err) {
    console.error("[quote/accept] 合約自動化流程失敗（不影響接受回應）:", err);
  }

  return NextResponse.json({ ok: true });
}
