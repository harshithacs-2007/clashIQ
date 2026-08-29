import { prisma, assertDatabaseConfigured } from "@/lib/db";
import { loginSchema } from "@/lib/validation";
import { verifyPassword, dummyPasswordHash } from "@/lib/crypto";
import { createSession } from "@/lib/auth";
import { guardMutating, parseJson, clientIp } from "@/lib/request";
import { jsonError, jsonOk, HttpError } from "@/lib/http";
import { applyCookies } from "@/lib/auth-cookies";
import { audit } from "@/lib/realtime";

export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    assertDatabaseConfigured();
    await guardMutating(req, `login:${ip}`, 12, 300);
    const body = loginSchema.parse(await parseJson(req));

    const since = new Date(Date.now() - 15 * 60 * 1000);
    const fails = await prisma.loginAttempt.count({
      where: { email: body.email, success: false, createdAt: { gte: since } },
    });
    if (fails >= 12) throw new HttpError(429, "Too many failed sign-ins. Try again later.");

    const user = await prisma.user.findUnique({ where: { email: body.email } });
    // Always verify against a hash so unknown emails do not take a faster path.
    const ok = await verifyPassword(user?.passwordHash ?? (await dummyPasswordHash()), body.password);
    await prisma.loginAttempt.create({
      data: { email: body.email, ip, success: Boolean(user && ok), userId: user?.id },
    });
    if (!user || !ok) throw new HttpError(401, "Invalid email or password.");

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const session = await createSession(user.id, { ip, userAgent: req.headers.get("user-agent") ?? undefined });
    await audit({
      actorId: user.id,
      action: user.role === "HOST" ? "HOST_LOGGED_IN" : "USER_LOGGED_IN",
    });
    const res = jsonOk({
      user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role },
    });
    applyCookies(res, session.token, session.expiresAt);
    return res;
  } catch (e) {
    return jsonError(e);
  }
}
