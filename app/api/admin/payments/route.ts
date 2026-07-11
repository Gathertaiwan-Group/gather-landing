import { NextResponse } from "next/server";
import { markPaymentPaid } from "@/lib/payment";
import { handlePaymentPaid } from "@/lib/lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 由 middleware（/api/admin/:path*）保護，這裡不再重覆驗證。

// 標記已收款（匯款）：markPaymentPaid（條件式 pending→paid）；
// 只有 transitioned===true 才跑 handlePaymentPaid 副作用（自動開案/結案＋寄信）——重按不重跑。
export async function PATCH(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const id = body.id ? String(body.id) : null;
  const action = String(body.action ?? "");
  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 422 });
  if (action !== "mark_paid") {
    return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 422 });
  }

  const result = await markPaymentPaid(id, { method: "bank_transfer" });
  if (!result) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  if (result.transitioned) {
    await handlePaymentPaid(result.payment.id);
  }

  return NextResponse.json({ ok: true, transitioned: result.transitioned, status: result.payment.status });
}
