import { Prisma } from "@prisma/client";
import { prisma, assertDatabaseConfigured } from "@/lib/db";
import { hashPassword } from "@/lib/crypto";
import { createSession } from "@/lib/auth";
import { applyCookies } from "@/lib/auth-cookies";
import { guardMutating, parseJson, clientIp } from "@/lib/request";
import { jsonError, jsonOk, HttpError } from "@/lib/http";
import { audit } from "@/lib/realtime";
import { signupSchema } from "@/lib/validation";
import { z } from "zod";

const hostSignupSchema = signupSchema.extend({
  inviteCode: z.string().min(1).max(200),
});

export async function POST(req: Request) {
  try {
    assertDatabaseConfigured();
    await guardMutating(req, `host-signup:${clientIp(req)}`, 5, 3600);

    const configuredCode = process.env.HOST_SIGNUP_CODE;
    if (!configuredCode) throw new HttpError(503, "Host signup is not configured.");

    const body = hostSignupSchema.parse(await parseJson(req));
    if (body.inviteCode !== configuredCode) throw new HttpError(403, "Invalid host invite code.");

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) throw new HttpError(409, "An account with that email already exists.");

    const user = await prisma.user.create({
      data: {
        email: body.email,
        displayName: body.displayName,
        passwordHash: await hashPassword(body.password),
        role: "HOST",
      },
    });

    const session = await createSession(user.id, {
      ip: clientIp(req),
      userAgent: req.headers.get("user-agent") ?? undefined,
    });
    await audit({ actorId: user.id, action: "HOST_SIGNED_UP", payload: { userId: user.id } });

    const res = jsonOk({
      user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role },
    }, 201);
    applyCookies(res, session.token, session.expiresAt);
    return res;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return jsonError(new HttpError(409, "An account with that email already exists."));
    }
    return jsonError(e);
  }
}
