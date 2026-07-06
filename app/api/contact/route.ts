import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase";
import { sendInquiryNotification } from "@/lib/resend";

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
  // Supabase 尚未啟用 / 未設定 key：回傳 fallback，前端顯示錯誤訊息。
  if (!supabase) {
    return NextResponse.json(
      { ok: false, fallback: true, error: "supabase_not_configured" },
      { status: 503 }
    );
  }

  const { data, error } = await supabase
    .from("contact_submissions")
    .insert({
      name,
      email: email || null,
      phone: phone || null,
      message,
      source: "website",
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  // 寄「新諮詢通知」給老闆（env 未設則略過）；成功就標記 notified。失敗不影響送出。
  try {
    const sent = await sendInquiryNotification({ name, email, phone, message, source: "website" });
    if (sent) await supabase.from("contact_submissions").update({ notified: true }).eq("id", data.id);
  } catch {
    /* 通知失敗不影響表單送出 */
  }

  return NextResponse.json({ ok: true });
}
