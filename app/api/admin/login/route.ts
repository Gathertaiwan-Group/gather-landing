import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, createSessionToken, verifyPassword } from "@/lib/adminAuth";

export const runtime = "nodejs";

const TTL_SECONDS = 60 * 60 * 24 * 7; // 7 天

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 登入：核對密碼 → 簽發 session cookie。 */
export async function POST(req: Request) {
  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const password = process.env.ADMIN_PASSWORD;
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!password || !secret) {
    return NextResponse.json({ ok: false, error: "admin_not_configured" }, { status: 503 });
  }

  const input = String(body.password ?? "");
  if (!(await verifyPassword(input, password))) {
    await sleep(300); // 減緩暴力破解
    return NextResponse.json(
      { ok: false, error: "invalid_password", message: "密碼錯誤，請再試一次。" },
      { status: 401 }
    );
  }

  const token = await createSessionToken(secret);
  cookies().set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TTL_SECONDS,
  });
  return NextResponse.json({ ok: true });
}

/** 登出：清除 cookie。 */
export async function DELETE() {
  cookies().delete(ADMIN_COOKIE);
  return NextResponse.json({ ok: true });
}
