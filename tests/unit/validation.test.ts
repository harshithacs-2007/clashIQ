import { describe, expect, it } from "vitest";
import { signupSchema, loginSchema } from "../../src/lib/validation";

describe("signup schema", () => {
  it("accepts a valid account payload", () => {
    const v = signupSchema.parse({
      email: "  Alex@Example.COM ",
      password: "longenough1",
      displayName: "Alex",
    });
    expect(v.email).toBe("alex@example.com");
  });

  it("rejects malformed email", () => {
    expect(() => signupSchema.parse({ email: "not-an-email", password: "longenough1", displayName: "Alex" })).toThrow();
  });

  it("rejects short passwords", () => {
    expect(() => signupSchema.parse({ email: "a@b.co", password: "short", displayName: "Alex" })).toThrow();
  });

  it("rejects oversized display names", () => {
    expect(() => signupSchema.parse({ email: "a@b.co", password: "longenough1", displayName: "x".repeat(50) })).toThrow();
  });
});

describe("login schema", () => {
  it("rejects empty password", () => {
    expect(() => loginSchema.parse({ email: "a@b.co", password: "" })).toThrow();
  });
});
