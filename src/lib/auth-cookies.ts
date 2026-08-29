import { NextResponse } from "next/server";
import { csrfCookieOptions, sessionCookieOptions } from "./auth";
import { randomToken } from "./crypto";

export function applyCookies(res: NextResponse, token: string, expiresAt: Date) {
  const s = sessionCookieOptions(expiresAt);
  res.cookies.set(s.name, token, s);
  const c = csrfCookieOptions();
  res.cookies.set(c.name, randomToken(24), c);
}
