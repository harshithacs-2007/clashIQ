import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk, HttpError } from "@/lib/http";
import { guardMutating, parseJson, requireUser } from "@/lib/request";
import { requireMembership } from "@/lib/access";
import { emitRoom } from "@/lib/realtime";
import { RealtimeEvent } from "@/lib/constants";
import type { ProctorSignal } from "@prisma/client";

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    await guardMutating(req, `psig:${user.id}`, 60, 60);
    const body = z.object({
      roomId: z.string(),
      signal: z.enum([
        "SHARE_STARTED",
        "SHARE_STOPPED",
        "CONNECTION_LOST",
        "CONNECTION_RESTORED",
        "VISIBILITY_HIDDEN",
        "VISIBILITY_VISIBLE",
        "FOCUS_LOST",
        "FOCUS_GAINED",
      ]),
    }).parse(await parseJson(req));
    await requireMembership(user.id, body.roomId);
    const session = await prisma.proctoringSession.findUnique({
      where: { roomId_userId: { roomId: body.roomId, userId: user.id } },
    });
    if (!session) throw new HttpError(404, "No proctoring session.");
    await prisma.proctoringEvent.create({
      data: { sessionId: session.id, signal: body.signal as ProctorSignal },
    });
    const sharing = body.signal === "SHARE_STARTED" || (session.sharing && body.signal !== "SHARE_STOPPED");
    const connected = body.signal !== "CONNECTION_LOST" && body.signal !== "SHARE_STOPPED";
    await prisma.proctoringSession.update({
      where: { id: session.id },
      data: {
        sharing: body.signal === "SHARE_STOPPED" ? false : sharing,
        connected,
      },
    });
    await emitRoom(body.roomId, RealtimeEvent.PROCTORING_STATUS_CHANGED, {
      userId: user.id,
      signal: body.signal,
    }, true);
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
