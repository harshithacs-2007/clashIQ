import { prisma } from "@/lib/db";
import { jsonError, jsonOk, HttpError } from "@/lib/http";
import { requireUser } from "@/lib/request";

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const roomId = new URL(req.url).searchParams.get("roomId");
    if (!roomId) throw new HttpError(400, "roomId is required.");
    const room = await prisma.room.findUnique({ where: { id: roomId }, include: { event: true } });
    if (!room) throw new HttpError(404, "Room not found.");
    const isEventHost = user.role === "HOST" && room.event.hostId === user.id;
    if (!isEventHost) {
      const member = await prisma.teamMember.findFirst({ where: { userId: user.id, team: { roomId } } });
      if (!member) throw new HttpError(403, "Not in this room.");
    }
    const board = await prisma.leaderboardEntry.findMany({
      where: { roomId },
      orderBy: [{ score: "desc" }, { teamId: "asc" }],
    });
    const teams = await prisma.team.findMany({ where: { roomId } });
    const transactions = await prisma.scoreTransaction.findMany({
      where: { roomId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return jsonOk({
      podium: board.slice(0, 3).map((row, i) => ({
        rank: i + 1,
        team: teams.find((t) => t.id === row.teamId),
        score: row.score,
      })),
      board: board.map((row, i) => ({
        rank: i + 1,
        team: teams.find((t) => t.id === row.teamId),
        score: row.score,
      })),
      transactions: isEventHost ? transactions : undefined,
    });
  } catch (e) {
    return jsonError(e);
  }
}
