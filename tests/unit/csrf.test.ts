import { describe, expect, it } from "vitest";
import { parseCookie } from "../../src/lib/csrf";

describe("cookie parser", () => {
  it("reads csrf cookie values", () => {
    const jar = parseCookie("clashiq_csrf=abc123; other=1");
    expect(jar.clashiq_csrf).toBe("abc123");
  });
});
