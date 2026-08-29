import "server-only";
import { prisma } from "./db";
import { getRedis } from "./redis";
import type { HealthState } from "@prisma/client";

export type HealthReport = {
  APPLICATION: HealthState;
  DATABASE: HealthState;
  REALTIME: HealthState;
  CODE_JUDGE: HealthState;
  PROCTORING: HealthState;
};

export async function collectHealth(): Promise<HealthReport> {
  const report: HealthReport = {
    APPLICATION: "HEALTHY",
    DATABASE: "OFFLINE",
    REALTIME: "OFFLINE",
    CODE_JUDGE: "OFFLINE",
    PROCTORING: "OFFLINE",
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    report.DATABASE = "HEALTHY";
  } catch {
    report.DATABASE = "OFFLINE";
    report.APPLICATION = "DEGRADED";
  }

  try {
    const redis = getRedis();
    if (!redis) {
      report.REALTIME = "OFFLINE";
    } else {
      if (redis.status === "wait") await redis.connect();
      const pong = await redis.ping();
      report.REALTIME = pong === "PONG" ? "HEALTHY" : "DEGRADED";
    }
  } catch {
    report.REALTIME = "OFFLINE";
    report.APPLICATION = "DEGRADED";
  }

  const judgeUrl = process.env.JUDGE0_URL?.trim();
  if (judgeUrl) {
    try {
      const res = await fetch(`${judgeUrl}/about`, { signal: AbortSignal.timeout(2500) });
      report.CODE_JUDGE = res.ok ? "HEALTHY" : "DEGRADED";
    } catch {
      report.CODE_JUDGE = "DEGRADED";
    }
  } else {
    report.CODE_JUDGE = "DEGRADED";
  }

  if (process.env.LIVEKIT_URL?.trim() && process.env.LIVEKIT_API_KEY?.trim()) {
    report.PROCTORING = "HEALTHY";
  } else {
    report.PROCTORING = "DEGRADED";
  }

  return report;
}
