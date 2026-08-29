import { prisma } from "@/lib/db";
import { loginSchema } from "@/lib/validation";
import { verifyPassword } from "@/lib/crypto";
import { createSession } from "@/lib/auth";
import { guardMutating, parseJson, clientIp } from "@/lib/request";
import { jsonError, jsonOk, HttpError } from "@/lib/http";
import { applyCookies } from "@/lib/auth-cookies";
import { audit } from "@/lib/realtime";

export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    await guardMutating(req, `login:${ip}`, 12, 300);
    const body = loginSchema.parse(await parseJson(req));

    const since = new Date(Date.now() - 15 * 60 * 1000);
    const fails = await prisma.loginAttempt.count({
      where: { email: body.email, success: false, createdAt: { gte: since } },
    });
    if (fails >= 12) throw new HttpError(429, "Too many failed sign-ins. Try again later.");

    const user = await prisma.user.findUnique({ where: { email: body.email } });
    const ok = user ? await verifyPassword(user.passwordHash, body.password) : false;
    await prisma.loginAttempt.create({
      data: { email: body.email, ip, success: ok, userId: user?.id },
    });
    if (!user || !ok) throw new HttpError(401, "Email or password is incorrect.");

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
