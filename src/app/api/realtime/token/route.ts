import { createHmac } from "node:crypto";
import { getEnv } from "@/lib/env";
import { jsonError, jsonOk, HttpError } from "@/lib/http";
import { requireUser } from "@/lib/request";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const roomId = new URL(req.url).searchParams.get("roomId");
    if (!roomId) throw new HttpError(400, "roomId is required.");
    const room = await prisma.room.findUnique({ where: { id: roomId }, include: { event: true, teams: { include: { members: true } } } });
    if (!room) throw new HttpError(404, "Room not found.");
    const isHost = user.role === "HOST" && room.event.hostId === user.id;
    const member = room.teams.flatMap((t) => t.members).find((m) => m.userId === user.id);
    if (!isHost && !member) throw new HttpError(403, "Not authorized for this room stream.");

    const env = getEnv();
    if (!env.REALTIME_SHARED_SECRET) throw new HttpError(503, "Realtime is not configured.");
    const exp = Math.floor(Date.now() / 1000) + 60 * 10;
    const payload = JSON.stringify({
      sub: user.id,
      roomId,
      role: isHost ? "HOST" : "PARTICIPANT",
      teamId: member?.teamId ?? null,
      exp,
    });
    const sig = createHmac("sha256", env.REALTIME_SHARED_SECRET).update(payload).digest("base64url");
    const token = Buffer.from(payload).toString("base64url") + "." + sig;
    return jsonOk({ token, url: process.env.NEXT_PUBLIC_REALTIME_URL ?? "ws://localhost:4001" });
  } catch (e) {
    return jsonError(e);
  }
}
