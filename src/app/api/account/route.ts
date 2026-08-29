import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk, HttpError } from "@/lib/http";
import { guardMutating, parseJson, requireUser } from "@/lib/request";

const profilePatch = z.object({
  displayName: z.string().min(2).max(40).trim(),
}).strict();

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const requested = new URL(req.url).searchParams.get("userId");
    if (requested && requested !== user.id) {
      throw new HttpError(403, "You do not have access to this resource.");
    }
    const avatar = await prisma.avatar.findUnique({ where: { userId: user.id } });
    const memberships = await prisma.teamMember.findMany({
      where: { userId: user.id },
      include: { team: { include: { room: { include: { event: true } } } } },
    });
    return jsonOk({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      avatar,
      events: memberships.map((m) => ({
        eventTitle: m.team.room.event.title,
        roomName: m.team.room.name,
        roomId: m.team.room.id,
        teamName: m.team.name,
        teamId: m.team.id,
      })),
    });
  } catch (e) {
    return jsonError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireUser(req);
    await guardMutating(req, `profile:${user.id}`, 20, 60);
    const body = profilePatch.parse(await parseJson(req));
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { displayName: body.displayName },
      select: { id: true, email: true, displayName: true, role: true },
    });
    return jsonOk({ user: updated });
  } catch (e) {
    return jsonError(e);
  }
}
