import { allowedOrigins } from "./env";
import { CSRF_COOKIE } from "./constants";
import { safeEqual } from "./crypto";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

export function originAllowed(origin: string | null, requestUrl?: string): boolean {
  if (!origin) return false;
  if (requestUrl) {
    try {
      if (origin === new URL(requestUrl).origin) return true;
    } catch {
      /* ignore */
    }
  }
  try {
    return allowedOrigins().some((allowed) => allowed === origin);
  } catch {
    return false;
  }
}

export function assertCsrf(req: Request): void {
  if (SAFE.has(req.method.toUpperCase())) return;
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const requestOrigin = (() => {
    try {
      return new URL(req.url).origin;
    } catch {
      return "";
    }
  })();
  const sameOrigin = Boolean(origin && requestOrigin && origin === requestOrigin);
  const allowed =
    sameOrigin ||
    originAllowed(origin, req.url) ||
    (referer ? allowedOrigins().some((a) => referer.startsWith(a)) || referer.startsWith(requestOrigin) : false);
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
