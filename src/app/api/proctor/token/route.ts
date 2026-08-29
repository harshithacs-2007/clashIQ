import { AccessToken } from "livekit-server-sdk";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { jsonError, jsonOk, HttpError } from "@/lib/http";
import { guardMutating, parseJson, requireHost, requireUser } from "@/lib/request";
import { requireHostOwnsRoom, requireMembership } from "@/lib/access";
import { prisma } from "@/lib/db";
import { emitRoom } from "@/lib/realtime";
import { RealtimeEvent } from "@/lib/constants";

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    await guardMutating(req, `livekit:${user.id}`, 20, 60);
    const env = getEnv();
    if (!env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET || !env.LIVEKIT_URL) {
      throw new HttpError(503, "Proctoring is not configured.");
    }
    const body = z.object({
      roomId: z.string(),
      role: z.enum(["publisher", "host"]),
    }).parse(await parseJson(req));

    if (body.role === "host") {
      await requireHostOwnsRoom((await requireHost(req)).id, body.roomId);
    } else {
      await requireMembership(user.id, body.roomId);
    }

    const lkRoom = `clashiq-${body.roomId}`;
    const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
      identity: user.id,
      name: user.displayName,
    });
    at.addGrant({
      roomJoin: true,
      room: lkRoom,
      canPublish: body.role === "publisher",
      canSubscribe: body.role === "host",
      canPublishData: false,
    });
    const token = await at.toJwt();

    if (body.role === "publisher") {
      const member = await requireMembership(user.id, body.roomId);
      await prisma.proctoringSession.upsert({
        where: { roomId_userId: { roomId: body.roomId, userId: user.id } },
        create: {
          roomId: body.roomId,
          userId: user.id,
          teamId: member.teamId,
          livekitRoom: lkRoom,
          sharing: true,
          connected: true,
        },
        update: { sharing: true, connected: true },
      });
      await emitRoom(body.roomId, RealtimeEvent.PROCTORING_STATUS_CHANGED, { userId: user.id, sharing: true }, true);
    }

    return jsonOk({ token, url: process.env.NEXT_PUBLIC_LIVEKIT_URL ?? env.LIVEKIT_URL, room: lkRoom });
  } catch (e) {
    return jsonError(e);
  }
}
