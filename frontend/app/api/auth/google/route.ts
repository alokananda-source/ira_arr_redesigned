import { NextRequest, NextResponse } from "next/server";

import { createSessionToken, SESSION_TTL_MS } from "@/lib/auth";
import { AUTH_COOKIE_NAME } from "@/lib/constants";

// Emergent-managed Google Auth: exchange the one-time session_id (from the auth redirect) for the
// user's profile server-side, enforce the @rumik.ai allowlist, then mint the same signed session
// cookie the shared-password gate uses so the existing middleware keeps working unchanged.
const SESSION_DATA_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data";
const ALLOWED_DOMAIN = "@rumik.ai";

export async function POST(request: NextRequest) {
  const secret = process.env.DASHBOARD_SESSION_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: { message: "Server misconfigured: DASHBOARD_SESSION_SECRET is not set.", code: "CONFIG_ERROR" } },
      { status: 500 },
    );
  }

  let sessionId = "";
  try {
    const body = (await request.json()) as { sessionId?: unknown };
    sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  } catch {
    return NextResponse.json(
      { ok: false, error: { message: "Invalid request body.", code: "BAD_REQUEST" } },
      { status: 400 },
    );
  }

  if (!sessionId) {
    return NextResponse.json(
      { ok: false, error: { message: "Missing session id.", code: "BAD_REQUEST" } },
      { status: 400 },
    );
  }

  let email = "";
  try {
    const res = await fetch(SESSION_DATA_URL, {
      headers: { "X-Session-ID": sessionId },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: { message: "Google sign-in failed. Please try again.", code: "AUTH_FAILED" } },
        { status: 401 },
      );
    }
    const data = (await res.json()) as { email?: unknown };
    email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
  } catch {
    return NextResponse.json(
      { ok: false, error: { message: "Could not reach the auth server. Try again.", code: "AUTH_UNREACHABLE" } },
      { status: 502 },
    );
  }

  if (!email.endsWith(ALLOWED_DOMAIN)) {
    return NextResponse.json(
      { ok: false, error: { message: "Access is limited to @rumik.ai accounts.", code: "FORBIDDEN_DOMAIN" } },
      { status: 403 },
    );
  }

  const token = await createSessionToken(secret);
  const response = NextResponse.json({ ok: true, email });
  response.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return response;
}
