import { NextResponse } from "next/server";
import { insertQuote, updateQuote, deleteQuote, type LineItem } from "@/lib/quote";

export const runtime = "nodejs";

// 由 middleware（/api/admin/:path*）保護，這裡不再重覆驗證。

type RawItem = { description?: unknown; qty?: unknown; unit_price?: unknown };

/** 把前端傳來的 line_items 正規化成 {description, qty, unit_price, amount}。
 *  amount 這裡先算好（data 層 normalizeLineItems 會再算一次，無妨）。 */
function coerceLineItems(raw: unknown): LineItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      const o = (r ?? {}) as RawItem;
      const qty = Number(o.qty) || 0;
      const unit_price = Number(o.unit_price) || 0;
      return {
        description: String(o.description ?? "").trim(),
        qty,
        unit_price,
        amount: Math.round(qty * unit_price),
      };
    })
    .filter((it) => it.description);
}

// ── 手動建立報價 ──
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const client_name = String(body.client_name ?? "").trim();
  const line_items = coerceLineItems(body.line_items);
  if (!client_name) {
    return NextResponse.json(
      { ok: false, error: "missing_fields", message: "請填客戶名稱。" },
      { status: 422 }
    );
  }
  if (line_items.length === 0) {
    return NextResponse.json(
      { ok: false, error: "no_line_items", message: "請至少填一個報價項目。" },
      { status: 422 }
    );
  }

  const id = await insertQuote({
    client_name,
    contact_email: body.contact_email ? String(body.contact_email) : null,
    contact_phone: body.contact_phone ? String(body.contact_phone) : null,
    contact_line: body.contact_line ? String(body.contact_line) : null,
    line_items,
    notes: body.notes ? String(body.notes) : null,
    created_by: "manual",
  });

  if (!id) {
    return NextResponse.json({ ok: false, error: "insert_failed" }, { status: 503 });
  }
  return NextResponse.json({ ok: true, id }, { status: 201 });
}

// ── 更新報價（草稿編輯 / 改狀態）──
export async function PATCH(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const id = body.id ? String(body.id) : null;
  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 422 });

  const patch: Parameters<typeof updateQuote>[1] = {};
  if (body.client_name !== undefined) patch.client_name = String(body.client_name);
  if (body.contact_email !== undefined) patch.contact_email = String(body.contact_email);
  if (body.contact_phone !== undefined) patch.contact_phone = String(body.contact_phone);
  if (body.contact_line !== undefined) patch.contact_line = String(body.contact_line);
  if (body.notes !== undefined) patch.notes = String(body.notes);
  if (body.valid_days !== undefined) patch.valid_days = Number(body.valid_days) || null;
  if (body.tax_rate !== undefined) patch.tax_rate = Number(body.tax_rate) || 0;
  if (body.status !== undefined) patch.status = String(body.status);
  if (body.line_items !== undefined) patch.line_items = coerceLineItems(body.line_items);

  const q = await updateQuote(id, patch);
  if (!q) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// ── 刪除報價 ──
export async function DELETE(req: Request) {
  let id: string | null = null;
  try {
    const body = await req.json();
    id = body?.id ? String(body.id) : null;
  } catch {
    // 沒有 body → 改讀 query param
  }
  if (!id) id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 422 });

  await deleteQuote(id);
  return NextResponse.json({ ok: true });
}
