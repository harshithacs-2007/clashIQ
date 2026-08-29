import { prisma } from "@/lib/db";
import { jsonError, HttpError } from "@/lib/http";
import { requireUser } from "@/lib/request";
import { requireHostOwnsRoom, requireMembership } from "@/lib/access";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req);
    const { id } = await ctx.params;
    const media = await prisma.uploadedMedia.findUnique({ where: { id } });
    if (!media) throw new HttpError(404, "Media not found.");

    if (media.roomId) {
      const room = await prisma.room.findUnique({
        where: { id: media.roomId },
        include: {
          event: true,
          currentActivity: { include: { quiz: { include: { questions: true } } } },
        },
      });
      if (!room) throw new HttpError(404, "Room not found.");
      const isHost = user.role === "HOST" && room.event.hostId === user.id;
      if (!isHost) {
        await requireMembership(user.id, room.id);
        const currentQ = room.currentActivity?.quiz?.questions.find((q) => q.current);
        if (currentQ?.imageId !== media.id) {
          throw new HttpError(403, "This image is not part of the live question.");
        }
      }
    } else if (media.uploaderId !== user.id) {
      throw new HttpError(403, "You do not have access to this resource.");
    }

    if (media.storageKey.startsWith("http://") || media.storageKey.startsWith("https://")) {
      const remote = await fetch(media.storageKey);
      if (!remote.ok || !remote.body) throw new HttpError(502, "Media is unavailable.");
      return new Response(remote.body, {
        status: 200,
        headers: {
          "content-type": media.mime,
          "cache-control": "private, max-age=60",
        },
      });
    }

    if (process.env.APP_ENV === "production") {
      throw new HttpError(404, "Media not found.");
    }
    const buf = await readFile(join(process.cwd(), "uploads", media.storageKey));
    return new Response(buf, {
      status: 200,
      headers: {
        "content-type": media.mime,
        "cache-control": "private, max-age=60",
      },
    });
  } catch (e) {
    return jsonError(e);
  }
}
