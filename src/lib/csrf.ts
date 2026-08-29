import { allowedOrigins } from "./env";
import { CSRF_COOKIE } from "./constants";
import { safeEqual } from "./crypto";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

export function originAllowed(origin: string | null): boolean {
  if (!origin) return false;
  return allowedOrigins().some((allowed) => allowed === origin);
}

export function assertCsrf(req: Request): void {
  if (SAFE.has(req.method.toUpperCase())) return;
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const allowed = originAllowed(origin) || (referer ? allowedOrigins().some((a) => referer.startsWith(a)) : false);
  if (!allowed) {
    const err = new Error("CSRF_ORIGIN");
    (err as Error & { status: number }).status = 403;
    throw err;
  }
  const header = req.headers.get("x-csrf-token");
  const cookie = parseCookie(req.headers.get("cookie") ?? "")[CSRF_COOKIE];
  if (!header || !cookie || !safeEqual(header, cookie)) {
    const err = new Error("CSRF_TOKEN");
    (err as Error & { status: number }).status = 403;
    throw err;
  }
}

export function parseCookie(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = decodeURIComponent(part.slice(idx + 1).trim());
    out[k] = v;
  }
  return out;
}
