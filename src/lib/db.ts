import { PrismaClient } from "@prisma/client";
import { HttpError } from "./http";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function databaseUrl(): string | undefined {
  const v = process.env.DATABASE_URL?.trim();
  return v ? v : undefined;
}

/** Auth and other DB routes must call this. Never fall back to mock users. */
export function assertDatabaseConfigured(): void {
  if (!databaseUrl()) {
    throw new HttpError(503, "Database is not configured.");
  }
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
