import { prisma } from "@/lib/db";
import { teamSchema } from "@/lib/validation";
import { jsonError, jsonOk, HttpError } from "@/lib/http";
import { guardMutating, parseJson, requireUser } from "@/lib/request";
import { emitRoom, audit } from "@/lib/realtime";
import { RealtimeEvent } from "@/lib/constants";

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    await guardMutating(req, `team:${user.id}`, 20, 60);
    const roomId = new URL(req.url).searchParams.get("roomId");
    if (!roomId) throw new HttpError(400, "roomId is required.");
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new HttpError(404, "Room not found.");
    if (!room.joinsEnabled || room.status === "CLOSED" || room.status === "LOCKED") {
      throw new HttpError(403, "Team changes are locked.");
    }
    const body = teamSchema.parse(await parseJson(req));

    const existing = await prisma.teamMember.findFirst({ where: { userId: user.id, team: { roomId } } });
    if (existing) throw new HttpError(409, "Already on a team in this room.");

    let team;
    if (body.teamId) {
      team = await prisma.team.findUnique({ where: { id: body.teamId }, include: { members: true } });
      if (!team || team.roomId !== roomId) throw new HttpError(404, "Team not found.");
      if (team.members.length >= room.teamSize) throw new HttpError(409, "Team is full.");
    } else {
      team = await prisma.team.create({
        data: { roomId, name: body.name, avatarSeed: body.name.toLowerCase().replace(/\s+/g, "-") },
        include: { members: true },
      });
      await prisma.leaderboardEntry.upsert({
        where: { roomId_teamId: { roomId, teamId: team.id } },
        create: { roomId, teamId: team.id, score: 0 },
        update: {},
      });
    }

    await prisma.teamMember.create({ data: { teamId: team.id, userId: user.id } });
    await audit({ roomId, actorId: user.id, action: "TEAM_JOINED", payload: { teamId: team.id } });
    await emitRoom(roomId, RealtimeEvent.TEAM_UPDATED, { teamId: team.id });
    return jsonOk({ teamId: team.id });
  } catch (e) {
    return jsonError(e);
  }
}
