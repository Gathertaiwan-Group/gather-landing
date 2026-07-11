import { NextResponse } from "next/server";
import { getContract, voidContract } from "@/lib/contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 由 middleware（/api/admin/:path*）保護，這裡不再重覆驗證。

// 作廢合約：status → voided（作廢後公開連結失效、不可再簽署）。
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
  if (action !== "void") {
    return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 422 });
  }

  const contract = await getContract(id);
  if (!contract) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (contract.status === "voided") {
    return NextResponse.json({ ok: true, already: true }); // 冪等：已作廢
  }

  const ok = await voidContract(id);
  if (!ok) return NextResponse.json({ ok: false, error: "void_failed" }, { status: 503 });
  return NextResponse.json({ ok: true });
}
