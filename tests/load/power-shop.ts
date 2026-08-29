/**
 * Power shop concurrency check.
 * Requires DATABASE_URL and a live offer. Run after seed + opening shop:
 *   tsx tests/load/power-shop.ts
 */
import { purchasePowerCard } from "../../src/lib/power-shop";

async function main() {
  const offerId = process.env.OFFER_ID;
  const roomId = process.env.ROOM_ID;
  const teamIds = (process.env.TEAM_IDS ?? "").split(",").filter(Boolean);
  const userId = process.env.USER_ID;
  if (!offerId || !roomId || !userId || teamIds.length < 10) {
    console.log("Skipped: set OFFER_ID, ROOM_ID, USER_ID, TEAM_IDS (comma, >=10).");
    process.exit(0);
  }
  const results = await Promise.all(
    teamIds.map((teamId, i) =>
      purchasePowerCard({
        offerId,
        teamId,
        userId,
        roomId,
        idempotencyKey: `load-${teamId}-${i}`,
      }).catch((e: Error) => ({ status: "error" as const, message: e.message })),
    ),
  );
  const ok = results.filter((r) => "status" in r && r.status === "ok").length;
  const sold = results.filter((r) => "status" in r && r.status === "sold_out").length;
  console.log(JSON.stringify({ ok, sold, total: results.length }));
}

main();
