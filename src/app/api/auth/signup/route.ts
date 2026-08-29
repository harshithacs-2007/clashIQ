import { prisma, assertDatabaseConfigured } from "@/lib/db";
import { hashPassword } from "@/lib/crypto";
import { signupSchema } from "@/lib/validation";
import { createSession } from "@/lib/auth";
import { applyCookies } from "@/lib/auth-cookies";
import { guardMutating, parseJson, clientIp } from "@/lib/request";
import { jsonError, jsonOk, HttpError } from "@/lib/http";
import { audit } from "@/lib/realtime";
import { Prisma } from "@prisma/client";

export async function POST(req: Request) {
  try {
    assertDatabaseConfigured();
    await guardMutating(req, `signup:${clientIp(req)}`, 8, 3600);
    const body = signupSchema.parse(await parseJson(req));
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) throw new HttpError(409, "An account with that email already exists.");
    const user = await prisma.user.create({
      data: {
        email: body.email,
        displayName: body.displayName,
        passwordHash: await hashPassword(body.password),
        role: "PARTICIPANT",
      },
    });
    const session = await createSession(user.id, { ip: clientIp(req), userAgent: req.headers.get("user-agent") ?? undefined });
    await audit({ actorId: user.id, action: "USER_SIGNED_UP", payload: { userId: user.id } });
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
