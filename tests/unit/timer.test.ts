import { describe, expect, it } from "vitest";
import { remainingMs, computeEndsAt } from "../../src/lib/timer";

describe("server timer", () => {
  it("returns full duration before start", () => {
    expect(
      remainingMs({
        status: "READY",
        durationMs: 60000,
        startedAt: null,
        pausedAt: null,
        extraMs: 5000,
        endsAt: null,
      }),
    ).toBe(65000);
  });

  it("does not use client clocks for endsAt", () => {
    const started = new Date("2026-01-01T00:00:00Z");
    const ends = computeEndsAt(started, 10000, 2000);
    expect(ends.toISOString()).toBe("2026-01-01T00:00:12.000Z");
  });

  it("freezes remaining time while paused", () => {
    const startedAt = new Date(Date.now() - 4000);
    const pausedAt = new Date(Date.now() - 1000);
    const left = remainingMs({
      status: "PAUSED",
      durationMs: 10000,
      startedAt,
      pausedAt,
      extraMs: 0,
      endsAt: null,
    });
    expect(left).toBeGreaterThan(5000);
    expect(left).toBeLessThan(8000);
  });
});
