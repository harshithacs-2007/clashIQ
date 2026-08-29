import { prisma } from "@/lib/db";
import { teamSchema } from "@/lib/validation";
import { jsonError, jsonOk, HttpError } from "@/lib/http";
import { guardMutating, parseJson, requireUser } from "@/lib/request";
import { emitRoom, audit } from "@/lib/realtime";
import { RealtimeEvent } from "@/lib/constants";
import { Prisma } from "@prisma/client";

function publicTeams(
  teams: {
    id: string;
    name: string;
    avatarSeed: string;
    members: { user: { displayName: string } }[];
  }[],
) {
  return teams.map((t) => ({
    id: t.id,
    name: t.name,
    avatarSeed: t.avatarSeed,
    members: t.members.map((m) => ({ displayName: m.user.displayName })),
  }));
}

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const roomId = new URL(req.url).searchParams.get("roomId");
    if (!roomId) throw new HttpError(400, "roomId is required.");
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        event: true,
        teams: { include: { members: { include: { user: { select: { displayName: true } } } } } },
      },
    });
    if (!room) throw new HttpError(404, "Room not found.");
    const member = room.teams.flatMap((t) => t.members).find((m) => m.userId === user.id);
    const isHost = user.role === "HOST" && room.event.hostId === user.id;
    const joinable = room.status === "OPEN" || room.status === "LIVE" || room.status === "PAUSED";
    if (!isHost && !member && !joinable) {
      throw new HttpError(403, "This room is not accepting joins.");
    }
    return jsonOk({
      room: { id: room.id, name: room.name, teamSize: room.teamSize, status: room.status },
      meTeamId: member?.teamId ?? null,
      teams: publicTeams(room.teams),
    });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    await guardMutating(req, `team:${user.id}`, 20, 60);
    const roomId = new URL(req.url).searchParams.get("roomId");
    if (!roomId) throw new HttpError(400, "roomId is required.");
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new HttpError(404, "Room not found.");
    if (room.status === "DRAFT" || room.status === "CLOSED" || room.status === "LOCKED" || !room.joinsEnabled) {
      throw new HttpError(403, "Team changes are locked.");
    }
    const body = teamSchema.parse(await parseJson(req));

    const teamId = await prisma.$transaction(async (tx) => {
      const existing = await tx.teamMember.findFirst({ where: { userId: user.id, team: { roomId } } });
      if (existing) throw new HttpError(409, "Already on a team in this room.");

      let team;
      if (body.teamId) {
        team = await tx.team.findUnique({ where: { id: body.teamId }, include: { members: true } });
        if (!team || team.roomId !== roomId) throw new HttpError(404, "Team not found.");
        if (team.members.length >= room.teamSize) throw new HttpError(409, "Team is full.");
      } else {
        team = await tx.team.create({
          data: { roomId, name: body.name, avatarSeed: body.name.toLowerCase().replace(/\s+/g, "-") },
          include: { members: true },
        });
        await tx.leaderboardEntry.upsert({
          where: { roomId_teamId: { roomId, teamId: team.id } },
          create: { roomId, teamId: team.id, score: 0 },
          update: {},
        });
      }

      await tx.teamMember.create({ data: { teamId: team.id, userId: user.id } });
      return team.id;
    });

    await audit({ roomId, actorId: user.id, action: "TEAM_JOINED", payload: { teamId } });
    await emitRoom(roomId, RealtimeEvent.TEAM_UPDATED, { teamId });
    return jsonOk({ teamId });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return jsonError(new HttpError(409, "That team name is already used in this room."));
    }
    return jsonError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser(req);
    await guardMutating(req, `team-leave:${user.id}`, 20, 60);
    const roomId = new URL(req.url).searchParams.get("roomId");
    if (!roomId) throw new HttpError(400, "roomId is required.");
    const member = await prisma.teamMember.findFirst({ where: { userId: user.id, team: { roomId } } });
    if (!member) throw new HttpError(404, "Not on a team in this room.");
    await prisma.teamMember.delete({ where: { id: member.id } });
    await emitRoom(roomId, RealtimeEvent.TEAM_UPDATED, { teamId: member.teamId });
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
