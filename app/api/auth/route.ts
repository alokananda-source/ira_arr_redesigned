import { NextRequest, NextResponse } from "next/server";

import { createSessionToken, safeEqual, SESSION_TTL_MS } from "@/lib/auth";
import { AUTH_COOKIE_NAME } from "@/lib/constants";

export async function POST(request: NextRequest) {
  const secret = process.env.DASHBOARD_SESSION_SECRET;
  const expectedPassword = process.env.DASHBOARD_PASSWORD;

  if (!secret || !expectedPassword) {
    return NextResponse.json(
      { ok: false, error: { message: "Server misconfigured: auth env vars are not set.", code: "CONFIG_ERROR" } },
      { status: 500 },
    );
  }

  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json(
      { ok: false, error: { message: "Invalid request body.", code: "BAD_REQUEST" } },
      { status: 400 },
    );
  }

  if (!password || !safeEqual(password, expectedPassword)) {
    return NextResponse.json(
      { ok: false, error: { message: "Incorrect password.", code: "INVALID_PASSWORD" } },
      { status: 401 },
    );
  }

  const token = await createSessionToken(secret);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return response;
}

/**
 * Log out. The session cookie is httpOnly so the page can't clear it itself; it has to be
 * expired server-side. This route sits outside the middleware matcher, so logging out works
 * even once the session has already expired.
 */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  // Same attributes as the cookie we set on login — a mismatch would leave the original in place.
  response.cookies.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
