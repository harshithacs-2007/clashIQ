import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../src/lib/crypto";

describe("argon2id passwords", () => {
  it("creates unique hashes and verifies the original secret", async () => {
    const a = await hashPassword("longenough1");
    const b = await hashPassword("longenough1");
    expect(a).not.toBe(b);
    expect(a).not.toContain("longenough1");
    expect(await verifyPassword(a, "longenough1")).toBe(true);
    expect(await verifyPassword(a, "wrong-password")).toBe(false);
  });
});
