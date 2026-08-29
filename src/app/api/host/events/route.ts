import { prisma } from "@/lib/db";
import { eventSchema } from "@/lib/validation";
import { jsonError, jsonOk } from "@/lib/http";
import { guardMutating, parseJson, requireHost } from "@/lib/request";
import { audit } from "@/lib/realtime";

export async function GET(req: Request) {
  try {
    const host = await requireHost(req);
    const events = await prisma.event.findMany({
      where: { hostId: host.id },
      include: { rooms: { orderBy: { createdAt: "desc" } } },
      orderBy: { createdAt: "desc" },
    });
    return jsonOk({ events });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const host = await requireHost(req);
    await guardMutating(req, `event-create:${host.id}`, 30, 60);
    const body = eventSchema.parse(await parseJson(req));
    const event = await prisma.event.create({
      data: { hostId: host.id, title: body.title, description: body.description },
    });
    await audit({ actorId: host.id, action: "HOST_CREATED_EVENT", payload: { eventId: event.id } });
    return jsonOk({ event }, 201);
  } catch (e) {
    return jsonError(e);
  }
}
