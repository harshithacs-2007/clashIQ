import { Prisma } from "@prisma/client";

export function isDatabaseUnavailable(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientInitializationError) return true;
  if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P1001" || error.code === "P1017")) {
    return true;
  }
  const msg = error instanceof Error ? error.message : "";
  return /Can't reach database server|P1001|P1012|P1013/i.test(msg);
}
