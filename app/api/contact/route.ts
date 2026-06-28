import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

type ContactBody = {
  name?: string;
  email?: string;
  phone?: string;
  message?: string;
};

export async function POST(req: Request) {
  let body: ContactBody;
  try {
    body = (await req.json()) as ContactBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  const message = (body.message ?? "").trim();
  const email = (body.email ?? "").trim();
  const phone = (body.phone ?? "").trim();

  if (!name || !message) {
    return NextResponse.json(
      { ok: false, error: "missing_fields" },
      { status: 422 }
    );
  }

  const supabase = createAdminSupabase();
  // Supabase 尚未啟用 / 未設定 key：回傳 fallback，前端引導改用 LINE。
  if (!supabase) {
    return NextResponse.json(
      { ok: false, fallback: true, error: "supabase_not_configured" },
      { status: 503 }
    );
  }

  const { error } = await supabase.from("contact_submissions").insert({
    name,
    email: email || null,
    phone: phone || null,
    message,
    source: "website",
  });

  if (error) {
    return NextResponse.json(
      { ok: false, error: "db_error" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
