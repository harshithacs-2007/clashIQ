import { prisma } from "@/lib/db";
import { joinRoomSchema } from "@/lib/validation";
import { jsonError, jsonOk, HttpError } from "@/lib/http";
import { guardMutating, parseJson, requireUser, clientIp } from "@/lib/request";
import { audit } from "@/lib/realtime";

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    await guardMutating(req, `join:${user.id}:${clientIp(req)}`, 20, 60);
    const { code } = joinRoomSchema.parse(await parseJson(req));
    const room = await prisma.room.findUnique({
      where: { code },
      include: { event: true },
    });
    if (!room) throw new HttpError(404, "Room code is not valid.");
    if (room.status === "CLOSED" || room.status === "DRAFT") {
      throw new HttpError(403, "This room is not accepting joins.");
    }
    if (!room.joinsEnabled || room.status === "LOCKED") {
      throw new HttpError(403, "Joins are locked for this room.");
    }
    const already = await prisma.teamMember.findFirst({
      where: { userId: user.id, team: { roomId: room.id } },
    });
    await audit({ roomId: room.id, actorId: user.id, action: "ROOM_JOIN_ATTEMPT" });
    return jsonOk({
      room: {
        id: room.id,
        name: room.name,
        eventTitle: room.event.title,
        teamSize: room.teamSize,
        status: room.status,
        joinPath: `/join/${room.code}`,
      },
      alreadyOnTeam: Boolean(already),
      teamId: already?.teamId ?? null,
    });
  } catch (e) {
    return jsonError(e);
  }
}
