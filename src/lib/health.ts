import "server-only";
import { prisma } from "./db";
import { getRedis } from "./redis";
import { getEnv } from "./env";
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
    const pong = await getRedis().ping();
    report.REALTIME = pong === "PONG" ? "HEALTHY" : "DEGRADED";
  } catch {
    report.REALTIME = "OFFLINE";
    report.APPLICATION = "DEGRADED";
  }

  const env = getEnv();
  if (env.JUDGE0_URL) {
    try {
      const res = await fetch(`${env.JUDGE0_URL}/about`, { signal: AbortSignal.timeout(2500) });
      report.CODE_JUDGE = res.ok ? "HEALTHY" : "DEGRADED";
    } catch {
      report.CODE_JUDGE = "DEGRADED";
    }
  } else {
    report.CODE_JUDGE = "DEGRADED";
  }

  if (env.LIVEKIT_URL && env.LIVEKIT_API_KEY) {
    report.PROCTORING = "HEALTHY";
  } else {
    report.PROCTORING = "DEGRADED";
  }

  return report;
}
