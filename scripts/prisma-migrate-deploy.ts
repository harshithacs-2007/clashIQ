import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function loadEnvFile(file: string, overwrite = false) {
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
    if (overwrite || !process.env[key]) process.env[key] = value.replace(/\0/g, "");
  }
}

function stripNulls(key: string) {
  const v = process.env[key];
  if (v) process.env[key] = v.replace(/\0/g, "").trim();
}

loadEnvFile(path.resolve(process.cwd(), ".env"));
loadEnvFile(path.resolve(process.cwd(), ".env.local"));
loadEnvFile(path.resolve(process.cwd(), ".env.vercel.production"), true);
for (const key of [
  "DATABASE_URL",
  "DIRECT_URL",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_PRISMA_URL",
]) {
  stripNulls(key);
}

if (!process.env.DATABASE_URL?.trim()) {
  console.error("DATABASE_URL is missing. Refusing to migrate. This app does not use a mock database.");
  process.exit(1);
}

const unpooled =
  process.env.DATABASE_URL_UNPOOLED?.trim() ||
  process.env.POSTGRES_URL_NON_POOLING?.trim();
if (unpooled) {
  process.env.DIRECT_URL = unpooled;
} else if (!process.env.DIRECT_URL?.trim()) {
  process.env.DIRECT_URL = process.env.DATABASE_URL;
}

try {
  const host = new URL(process.env.DIRECT_URL.replace(/^postgresql:/, "http:")).host;
  console.log(`Migrating database host: ${host}`);
} catch {
  console.log("Migrating database (host parse skipped)");
}

const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
