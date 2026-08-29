import { prisma } from "../src/lib/db";
import { hashPassword } from "../src/lib/crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function loadEnvFile(file: string) {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value.replace(/\0/g, "");
  }
}

loadEnvFile(path.resolve(process.cwd(), ".env.vercel.production"));
loadEnvFile(path.resolve(process.cwd(), ".env.local"));

async function main() {
  const email = process.env.SEED_HOST_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_HOST_PASSWORD;
  if (!email || !password || password.length < 10) {
    throw new Error("SEED_HOST_EMAIL and SEED_HOST_PASSWORD (>=10 chars) are required.");
  }
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is required.");
  }
  const host = await prisma.user.upsert({
    where: { email },
    update: { role: "HOST", passwordHash: await hashPassword(password), displayName: "Arena Host" },
    create: {
      email,
      displayName: "Arena Host",
      passwordHash: await hashPassword(password),
      role: "HOST",
    },
    select: { id: true, role: true },
  });
  console.log(`Host account ready role=${host.role} id=${host.id}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : "ensure-host failed");
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
