import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_COOKIE, verifySessionToken } from "@/lib/adminAuth";

/**
 * 後台閘門：保護 /admin/* 與 /api/admin/*。
 * 驗證 HMAC 簽章 cookie，未過 → 頁面導向登入、API 回 401。
 * 任何驗證失敗都當未登入（fail-closed）。
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 放行登入頁與登入 API，避免導向迴圈
  if (pathname === "/admin/login" || pathname === "/api/admin/login") {
    return NextResponse.next();
  }

  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const secret = process.env.ADMIN_SESSION_SECRET; // build 時 inline 進 middleware bundle
  const ok = token && secret ? await verifySessionToken(token, secret) : false;

  if (!ok) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/api/admin/:path*"],
};
