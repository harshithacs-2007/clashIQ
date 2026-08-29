import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk, HttpError } from "@/lib/http";
import { guardMutating, parseJson, requireUser, idempotencyKey } from "@/lib/request";
import { requireMembership } from "@/lib/access";
import { applyScore } from "@/lib/scoring";
import { emitRoom, audit } from "@/lib/realtime";
import { RealtimeEvent } from "@/lib/constants";

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    await guardMutating(req, `chal:${user.id}`, 20, 60);
    const body = z.object({
      roomId: z.string(),
      opponentId: z.string(),
    }).parse(await parseJson(req));
    const member = await requireMembership(user.id, body.roomId);
    const room = await prisma.room.findUnique({ where: { id: body.roomId } });
    if (!room?.challengesOn) throw new HttpError(403, "Challenges are disabled.");
    if (member.teamId === body.opponentId) throw new HttpError(400, "Choose another team.");
    const opponent = await prisma.team.findUnique({ where: { id: body.opponentId } });
    if (!opponent || opponent.roomId !== body.roomId) throw new HttpError(404, "Opponent not found.");

    const challenge = await prisma.challenge.create({
      data: {
        roomId: body.roomId,
        challengerId: member.teamId,
        opponentId: body.opponentId,
        status: "PENDING",
        idempotencyKey: idempotencyKey(req, `chal:${member.teamId}:${body.opponentId}:${Date.now()}`),
      },
    });
    await audit({ roomId: body.roomId, actorId: user.id, action: "CHALLENGE_STARTED", payload: { challengeId: challenge.id } });
    await emitRoom(body.roomId, RealtimeEvent.CHALLENGE_STARTED, { challenge });
    return jsonOk({ challenge });
  } catch (e) {
    return jsonError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireUser(req);
    await guardMutating(req, `chal-act:${user.id}`, 30, 60);
    const body = z.object({
      challengeId: z.string(),
      action: z.enum(["ACCEPT", "DECLINE", "COMPLETE"]),
      winnerId: z.string().optional(),
    }).parse(await parseJson(req));
    const challenge = await prisma.challenge.findUnique({ where: { id: body.challengeId } });
    if (!challenge) throw new HttpError(404, "Challenge not found.");
    const member = await requireMembership(user.id, challenge.roomId);

    if (body.action === "DECLINE" && member.teamId === challenge.opponentId) {
      await prisma.challenge.update({ where: { id: challenge.id }, data: { status: "DECLINED" } });
      return jsonOk({ ok: true });
    }
    if (body.action === "ACCEPT" && member.teamId === challenge.opponentId) {
      await prisma.challenge.update({ where: { id: challenge.id }, data: { status: "LIVE" } });
      await emitRoom(challenge.roomId, RealtimeEvent.CHALLENGE_STARTED, { challengeId: challenge.id, status: "LIVE" });
      return jsonOk({ ok: true });
    }
    if (body.action === "COMPLETE") {
      const winnerId = body.winnerId;
      if (winnerId !== challenge.challengerId && winnerId !== challenge.opponentId) {
        throw new HttpError(400, "Invalid winner.");
      }
      const hostEvent = await prisma.room.findUnique({
        where: { id: challenge.roomId },
        include: { event: true },
      });
      if (user.role !== "HOST" || hostEvent?.event.hostId !== user.id) {
        throw new HttpError(403, "Only the host can resolve a challenge.");
      }
      await prisma.challenge.update({
        where: { id: challenge.id },
        data: { status: "COMPLETED", winnerId, resolvedAt: new Date() },
      });
      const winner = await prisma.team.findUnique({ where: { id: winnerId } });
      const doubled = winner?.doubleUntil && winner.doubleUntil > new Date();
      const pts = doubled ? 300 : 150;
      await applyScore({
        roomId: challenge.roomId,
        teamId: winnerId,
        delta: pts,
        reason: "CHALLENGE_WIN",
        refType: "challenge",
        refId: challenge.id,
        actorUserId: user.id,
        idempotencyKey: `score:chal:${challenge.id}`,
      });
      await emitRoom(challenge.roomId, RealtimeEvent.CHALLENGE_FINISHED, { challengeId: challenge.id, winnerId, points: pts });
      return jsonOk({ ok: true, points: pts });
    }
    throw new HttpError(403, "Not allowed.");
  } catch (e) {
    return jsonError(e);
  }
}
