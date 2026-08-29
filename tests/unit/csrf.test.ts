import { describe, expect, it } from "vitest";
import { parseCookie, originAllowed, assertCsrf } from "../../src/lib/csrf";

describe("cookie parser", () => {
  it("reads csrf cookie values", () => {
    const jar = parseCookie("clashiq_csrf=abc123; other=1");
    expect(jar.clashiq_csrf).toBe("abc123");
  });
});

describe("csrf origin", () => {
  it("allows same-origin preview deployments", () => {
    expect(originAllowed("https://clash-preview.vercel.app", "https://clash-preview.vercel.app/api/auth/login")).toBe(true);
  });

  it("rejects a foreign origin", () => {
    expect(originAllowed("https://evil.example", "https://clash-preview.vercel.app/api/auth/login")).toBe(false);
  });

  it("rejects mutating requests without csrf token", () => {
    const req = new Request("https://app.example/api/auth/login", {
      method: "POST",
      headers: { origin: "https://app.example" },
    });
    expect(() => assertCsrf(req)).toThrow(/CSRF_TOKEN/);
  });
});
