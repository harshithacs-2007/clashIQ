import "server-only";
import { cookies } from "next/headers";
import type { Role } from "@prisma/client";
import { prisma } from "./db";
import { randomToken, sha256 } from "./crypto";
import { CSRF_COOKIE, SESSION_COOKIE } from "./constants";
import { isSecureCookie } from "./env";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  role: Role;
};

export async function createSession(userId: string, meta?: { ip?: string; userAgent?: string }) {
  const token = randomToken(32);
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    },
  });
  return { token, expiresAt };
}

export async function readSession(): Promise<AuthUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getUserBySessionToken(token);
}

export async function getUserBySessionToken(token: string): Promise<AuthUser | null> {
  const tokenHash = sha256(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    displayName: session.user.displayName,
    role: session.user.role,
  };
}

export async function revokeSession(token: string) {
  await prisma.session.updateMany({
    where: { tokenHash: sha256(token) },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllUserSessions(userId: string) {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    name: SESSION_COOKIE,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isSecureCookie(),
    path: "/",
    expires: expiresAt,
  };
}

export function csrfCookieOptions() {
  return {
    name: CSRF_COOKIE,
    httpOnly: false,
    sameSite: "lax" as const,
    secure: isSecureCookie(),
    path: "/",
  };
}

export function requireRole(user: AuthUser | null, role: Role): AuthUser {
  if (!user) {
    const err = new Error("UNAUTHENTICATED");
    (err as Error & { status: number }).status = 401;
    throw err;
  }
  if (user.role !== role) {
    const err = new Error("FORBIDDEN");
    (err as Error & { status: number }).status = 403;
    throw err;
  }
  return user;
}
