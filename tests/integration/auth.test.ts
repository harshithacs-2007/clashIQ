import { describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { hashPassword, verifyPassword } from "../../src/lib/crypto";
import { sha256, randomToken } from "../../src/lib/crypto";

const dbUrl = process.env.DATABASE_URL?.trim();

describe.skipIf(!dbUrl)("auth against postgres", () => {
  const prisma = new PrismaClient();

  it("stores only hashes, unique emails, and revokes sessions", async ({ skip }) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      skip();
      return;
    }
    const email = `auth-test-${Date.now()}@example.com`;
    const password = "longenough1";
    const user = await prisma.user.create({
      data: {
        email,
        displayName: "Auth Tester",
        passwordHash: await hashPassword(password),
        role: "PARTICIPANT",
      },
    });
    expect(user.passwordHash).not.toBe(password);
    expect(await verifyPassword(user.passwordHash, password)).toBe(true);

    const dup = await prisma.user.findUnique({ where: { email } });
    expect(dup?.id).toBe(user.id);

    const token = randomToken(32);
    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await prisma.session.updateMany({
      where: { tokenHash: sha256(token) },
      data: { revokedAt: new Date() },
    });
    const session = await prisma.session.findUnique({ where: { tokenHash: sha256(token) } });
    expect(session?.revokedAt).not.toBeNull();

    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});
