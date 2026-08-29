import { writeFile } from "node:fs/promises";

const stages = [10, 25, 50, 75, 100];

async function main() {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const results: { users: number; ok: boolean; error?: string }[] = [];
  for (const users of stages) {
    try {
      const res = await fetch(`${base}/api/auth/me`);
      results.push({ users, ok: res.ok });
    } catch (e) {
      results.push({ users, ok: false, error: e instanceof Error ? e.message : "fail" });
    }
  }
  await writeFile("load-results.json", JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2));
  console.log("Wrote load-results.json — these are smoke probes, not capacity guarantees.");
}

main();
