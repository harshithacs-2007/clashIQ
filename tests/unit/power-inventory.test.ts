import { describe, expect, it } from "vitest";

function stampede(inventory: number, attempts: number) {
  let left = inventory;
  let success = 0;
  for (let i = 0; i < attempts; i++) {
    if (left > 0) {
      left -= 1;
      success += 1;
    }
  }
  return { success, left };
}

describe("power shop inventory rule", () => {
  it("never goes negative and caps winners at inventory", () => {
    const r = stampede(3, 100);
    expect(r.success).toBe(3);
    expect(r.left).toBe(0);
  });
});
