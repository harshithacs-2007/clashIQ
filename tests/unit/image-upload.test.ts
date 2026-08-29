import { describe, expect, it } from "vitest";
import { looksLikeImage, validateImageUpload } from "../../src/lib/storage";
import { HttpError } from "../../src/lib/http";

describe("image upload validation", () => {
  it("accepts a PNG header", () => {
    const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(looksLikeImage(header, "image/png")).toBe(true);
    expect(() => validateImageUpload({ size: 12, type: "image/png" }, header, 1000)).not.toThrow();
  });

  it("rejects a text file pretending to be png", () => {
    const header = Buffer.from("not-an-image!!!!");
    expect(looksLikeImage(header, "image/png")).toBe(false);
    expect(() => validateImageUpload({ size: 12, type: "image/png" }, header, 1000)).toThrow(HttpError);
  });

  it("rejects oversized files", () => {
    const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(() => validateImageUpload({ size: 5000, type: "image/png" }, header, 100)).toThrow(HttpError);
  });

  it("rejects non-image mime types", () => {
    const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(() => validateImageUpload({ size: 12, type: "application/pdf" }, header, 1000)).toThrow(HttpError);
  });
});
