import { NextResponse } from "next/server";
import { getCase } from "@/lib/adminCases";
import { completeCaseAndRequestFinal } from "@/lib/lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 由 middleware（/api/admin/:path*）保護，這裡不再重覆驗證。
// 完工編排（case→已完成→作廢未付訂金→產尾款→寄信→system update）統一在
// lib/lifecycle.ts 的 completeCaseAndRequestFinal——portal 線上驗收（is_final approve）
// 也走同一條路，兩個入口行為一致。

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const id = body.id ? String(body.id) : null;
  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 422 });

  const caseRow = await getCase(id);
  if (!caseRow) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const result = await completeCaseAndRequestFinal(caseRow.id);
  if (!result.ok) return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  if (result.already) return NextResponse.json({ ok: true, paymentId: result.paymentId, already: true });
  return NextResponse.json({ ok: true, paymentId: result.paymentId, emailed: result.emailed });
}
