import { describe, expect, it } from "vitest";
import { jsonError } from "../../src/lib/http";
import { signupSchema } from "../../src/lib/validation";

describe("api errors", () => {
  it("does not echo stack traces for validation failures", async () => {
    let parsed: unknown;
    try {
      signupSchema.parse({ email: "x", password: "short", displayName: "A" });
    } catch (e) {
      parsed = e;
    }
    const res = jsonError(parsed);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe("Check your input and try again.");
    expect(JSON.stringify(body)).not.toMatch(/stack/i);
  });
});
