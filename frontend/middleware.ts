import { NextRequest, NextResponse } from "next/server";

import { verifySessionToken } from "@/lib/auth";
import { AUTH_COOKIE_NAME } from "@/lib/constants";

export const config = {
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)"],
};

export async function middleware(request: NextRequest) {
  const secret = process.env.DASHBOARD_SESSION_SECRET;
  const isApiRoute = request.nextUrl.pathname.startsWith("/api/");

  if (!secret) {
    const message = "Server misconfigured: DASHBOARD_SESSION_SECRET is not set.";
    return isApiRoute
      ? NextResponse.json({ ok: false, error: { message, code: "CONFIG_ERROR" } }, { status: 500 })
      : new NextResponse(message, { status: 500 });
  }

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const isValid = await verifySessionToken(token, secret);
  if (isValid) return NextResponse.next();

  if (isApiRoute) {
    return NextResponse.json({ ok: false, error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}
