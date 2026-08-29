import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk, HttpError } from "@/lib/http";
import { guardMutating, parseJson, requireUser, idempotencyKey } from "@/lib/request";
import { requireMembership } from "@/lib/access";
import { applyScore } from "@/lib/scoring";
import { emitRoom, audit } from "@/lib/realtime";
import { RealtimeEvent } from "@/lib/constants";

const COUNTDOWN_MS = 5000;

async function advanceCountdown(challengeId: string) {
  const challenge = await prisma.challenge.findUnique({ where: { id: challengeId } });
  if (!challenge || challenge.status !== "COUNTDOWN" || !challenge.countdownEndsAt) return challenge;
  if (challenge.countdownEndsAt.getTime() > Date.now()) return challenge;
  return prisma.challenge.updateMany({
    where: { id: challengeId, status: "COUNTDOWN", countdownEndsAt: { lte: new Date() } },
    data: { status: "LIVE" },
  }).then(async () => prisma.challenge.findUnique({ where: { id: challengeId } }));
}

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new HttpError(400, "id is required.");
    const challenge = await prisma.challenge.findUnique({ where: { id } });
    if (!challenge) throw new HttpError(404, "Challenge not found.");
    await requireMembership(user.id, challenge.roomId);
    const advanced = await advanceCountdown(challenge.id);
    return jsonOk({ challenge: advanced ?? challenge, serverNow: new Date().toISOString() });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    await guardMutating(req, `chal:${user.id}`, 20, 60);
    const body = z.object({ roomId: z.string(), opponentId: z.string() }).parse(await parseJson(req));
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
    const body = z.object({ challengeId: z.string(), action: z.enum(["ACCEPT", "DECLINE", "COMPLETE"]), winnerId: z.string().optional() }).parse(await parseJson(req));
    const challenge = await prisma.challenge.findUnique({ where: { id: body.challengeId } });
    if (!challenge) throw new HttpError(404, "Challenge not found.");
    const member = await requireMembership(user.id, challenge.roomId);

    if (body.action === "DECLINE" && member.teamId === challenge.opponentId) {
      if (challenge.status !== "PENDING") throw new HttpError(409, "Challenge is no longer pending.");
      await prisma.challenge.update({ where: { id: challenge.id }, data: { status: "DECLINED" } });
      return jsonOk({ ok: true });
    }
    if (body.action === "ACCEPT" && member.teamId === challenge.opponentId) {
      if (challenge.status !== "PENDING") throw new HttpError(409, "Challenge is no longer pending.");
      const countdownEndsAt = new Date(Date.now() + COUNTDOWN_MS);
      const updated = await prisma.challenge.update({
        where: { id: challenge.id },
        data: { status: "COUNTDOWN", countdownEndsAt },
      });
      await emitRoom(challenge.roomId, RealtimeEvent.CHALLENGE_STARTED, {
        challengeId: challenge.id,
        status: "COUNTDOWN",
        countdownEndsAt: countdownEndsAt.toISOString(),
      });
      return jsonOk({ ok: true, challenge: updated, countdownMs: COUNTDOWN_MS });
    }
    if (body.action === "COMPLETE") {
      const current = await advanceCountdown(challenge.id);
      if (!current || current.status !== "LIVE") throw new HttpError(409, "Challenge is not live yet.");
      const winnerId = body.winnerId;
      if (winnerId !== current.challengerId && winnerId !== current.opponentId) throw new HttpError(400, "Invalid winner.");
      const hostEvent = await prisma.room.findUnique({ where: { id: current.roomId }, include: { event: true } });
      if (user.role !== "HOST" || hostEvent?.event.hostId !== user.id) throw new HttpError(403, "Only the host can resolve a challenge.");
      await prisma.challenge.update({ where: { id: current.id }, data: { status: "COMPLETED", winnerId, resolvedAt: new Date() } });
      const winner = await prisma.team.findUnique({ where: { id: winnerId } });
      const doubled = winner?.doubleUntil && winner.doubleUntil > new Date();
      const pts = doubled ? 300 : 150;
      await applyScore({ roomId: current.roomId, teamId: winnerId, delta: pts, reason: "CHALLENGE_WIN", refType: "challenge", refId: current.id, actorUserId: user.id, idempotencyKey: `score:chal:${current.id}` });
      await emitRoom(current.roomId, RealtimeEvent.CHALLENGE_FINISHED, { challengeId: current.id, winnerId, points: pts });
      return jsonOk({ ok: true, points: pts });
    }
    throw new HttpError(403, "Not allowed.");
  } catch (e) {
    return jsonError(e);
  }
}
