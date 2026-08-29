import { describe, expect, it } from "vitest";
import { signupSchema, loginSchema, quizQuestionSchema } from "../../src/lib/validation";

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

describe("quiz question schema", () => {
  const base = {
    activityId: "act1",
    prompt: "2+2?",
    options: [
      { label: "4", isCorrect: true },
      { label: "5", isCorrect: false },
    ],
  };

  it("accepts a valid MCQ", () => {
    const v = quizQuestionSchema.parse({ ...base, points: 25 });
    expect(v.points).toBe(25);
  });

  it("rejects a single option", () => {
    expect(() => quizQuestionSchema.parse({ ...base, options: [{ label: "only", isCorrect: true }] })).toThrow();
  });

  it("rejects invalid points", () => {
    expect(() => quizQuestionSchema.parse({ ...base, points: 0 })).toThrow();
    expect(() => quizQuestionSchema.parse({ ...base, points: 1.5 })).toThrow();
  });

  it("rejects empty prompt", () => {
    expect(() => quizQuestionSchema.parse({ ...base, prompt: "" })).toThrow();
  });
});
