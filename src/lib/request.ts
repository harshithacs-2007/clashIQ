import { cookies } from "next/headers";
import { SESSION_COOKIE } from "./constants";
import { getUserBySessionToken, type AuthUser, requireRole } from "./auth";
import { assertCsrf } from "./csrf";
import { rateLimit } from "./rate-limit";
import { HttpError } from "./http";
import { assertDatabaseConfigured } from "./db";
import type { Role } from "@prisma/client";

export async function parseJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON body.");
  }
}

export async function requireUser(req: Request): Promise<AuthUser> {
  assertDatabaseConfigured();
  const token = parseCookieHeader(req)[SESSION_COOKIE] ?? (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) throw new HttpError(401, "Sign in to continue.");
  const user = await getUserBySessionToken(token);
  if (!user) throw new HttpError(401, "Session expired. Sign in again.");
  return user;
}

export async function requireHost(req: Request): Promise<AuthUser> {
  const user = await requireUser(req);
  return requireRole(user, "HOST" as Role);
}

export async function guardMutating(req: Request, limitKey: string, limit = 30, windowSec = 60) {
  assertCsrf(req);
  const rl = await rateLimit({ key: limitKey, limit, windowSec });
  if (!rl.ok) throw new HttpError(429, "Too many requests. Slow down.");
}

function parseCookieHeader(req: Request): Record<string, string> {
  const header = req.headers.get("cookie") ?? "";
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "0.0.0.0";
}

export function idempotencyKey(req: Request, fallback: string): string {
  return req.headers.get("idempotency-key") || fallback;
}
