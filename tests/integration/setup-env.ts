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

loadEnvFile(path.resolve(process.cwd(), ".env.local"));
loadEnvFile(path.resolve(process.cwd(), ".env.vercel.production"), true);
if (!process.env.LIVE_APP_URL) {
  process.env.LIVE_APP_URL = "https://clash-iq-zeta.vercel.app";
}
