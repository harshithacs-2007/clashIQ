import { describe, expect, it } from "vitest";
import { sha256, safeEqual } from "../../src/lib/crypto";

describe("crypto helpers", () => {
  it("hashes deterministically", () => {
    expect(sha256("clashiq")).toHaveLength(64);
    expect(sha256("clashiq")).toBe(sha256("clashiq"));
  });

  it("rejects different length secrets", () => {
    expect(safeEqual("abc", "ab")).toBe(false);
    expect(safeEqual("abc", "abc")).toBe(true);
  });
});
