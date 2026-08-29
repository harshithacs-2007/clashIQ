import { prisma } from "@/lib/db";
import { roomSchema } from "@/lib/validation";
import { roomCode } from "@/lib/crypto";
import { jsonError, jsonOk, HttpError } from "@/lib/http";
import { guardMutating, parseJson, requireHost } from "@/lib/request";
import { audit } from "@/lib/realtime";

export async function POST(req: Request) {
  try {
    const host = await requireHost(req);
    await guardMutating(req, `room-create:${host.id}`, 30, 60);
    const body = roomSchema.parse(await parseJson(req));
    const eventId = new URL(req.url).searchParams.get("eventId");
    if (!eventId) throw new HttpError(400, "eventId is required.");
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event || event.hostId !== host.id) throw new HttpError(403, "You do not host this event.");

    let code = roomCode();
    for (let i = 0; i < 5; i++) {
      const clash = await prisma.room.findUnique({ where: { code } });
      if (!clash) break;
      code = roomCode();
    }

    const room = await prisma.room.create({
      data: { eventId, name: body.name, teamSize: body.teamSize, code, status: "DRAFT" },
    });
    await prisma.powerCardCatalog.createMany({
      data: [
        { type: "STEAL", name: "Steal", description: "Take points from an eligible opponent after a win.", defaultCost: 200, durationMs: 0 },
        { type: "DOUBLE_POINTS", name: "Double", description: "Multiply eligible challenge points.", defaultCost: 150, durationMs: 120000 },
        { type: "SHIELD", name: "Shield", description: "Block an eligible steal.", defaultCost: 120, durationMs: 180000 },
        { type: "FREEZE", name: "Freeze", description: "Temporarily disable an opponent action.", defaultCost: 180, durationMs: 30000 },
      ],
      skipDuplicates: true,
    });
    await audit({ roomId: room.id, actorId: host.id, action: "HOST_CREATED_ROOM", payload: { code: room.code } });
    return jsonOk({ room }, 201);
  } catch (e) {
    return jsonError(e);
  }
}
