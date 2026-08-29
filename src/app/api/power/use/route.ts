import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk, HttpError } from "@/lib/http";
import { guardMutating, parseJson, requireUser, idempotencyKey } from "@/lib/request";
import { requireMembership } from "@/lib/access";
import { applyScore } from "@/lib/scoring";

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    await guardMutating(req, `pcard:${user.id}`, 20, 60);
    const body = z.object({
      roomId: z.string(),
      cardType: z.enum(["STEAL", "DOUBLE_POINTS", "SHIELD", "FREEZE"]),
      targetTeamId: z.string().optional(),
    }).parse(await parseJson(req));
    const member = await requireMembership(user.id, body.roomId);
    if (body.targetTeamId) {
      if (body.targetTeamId === member.teamId) throw new HttpError(400, "Choose another team.");
      const target = await prisma.team.findUnique({ where: { id: body.targetTeamId } });
      if (!target || target.roomId !== body.roomId) throw new HttpError(403, "Target is not in this room.");
    }
    const key = idempotencyKey(req, `use:${member.teamId}:${body.cardType}:${body.targetTeamId ?? "self"}`);

    await prisma.$transaction(async (tx) => {
      const card = await tx.teamPowerCard.findUnique({
        where: { teamId_cardType: { teamId: member.teamId, cardType: body.cardType } },
      });
      if (!card || card.quantity < 1) throw new HttpError(400, "You do not have that card.");
      await tx.teamPowerCard.update({
        where: { id: card.id },
        data: { quantity: { decrement: 1 } },
      });
      await tx.powerCardUse.create({
        data: {
          teamId: member.teamId,
          targetTeamId: body.targetTeamId,
          cardType: body.cardType,
          userId: user.id,
          idempotencyKey: key,
        },
      });
      const now = new Date();
      if (body.cardType === "SHIELD") {
        await tx.team.update({ where: { id: member.teamId }, data: { shieldUntil: new Date(now.getTime() + 180000) } });
      }
      if (body.cardType === "DOUBLE_POINTS") {
        await tx.team.update({ where: { id: member.teamId }, data: { doubleUntil: new Date(now.getTime() + 120000) } });
      }
      if (body.cardType === "FREEZE") {
        if (!body.targetTeamId) throw new HttpError(400, "Target required.");
        await tx.team.update({ where: { id: body.targetTeamId }, data: { freezeUntil: new Date(now.getTime() + 30000) } });
      }
    });

    if (body.cardType === "STEAL") {
      if (!body.targetTeamId) throw new HttpError(400, "Target required.");
      const target = await prisma.team.findUnique({ where: { id: body.targetTeamId } });
      if (target?.shieldUntil && target.shieldUntil > new Date()) {
        return jsonOk({ ok: false, message: "Target is shielded." });
      }
      const amount = 50;
      await applyScore({
        roomId: body.roomId,
        teamId: body.targetTeamId,
        delta: -amount,
        reason: "POWER_STEAL",
        refType: "steal_from",
        refId: key,
        actorUserId: user.id,
        idempotencyKey: `score:steal-from:${key}`,
      });
      await applyScore({
        roomId: body.roomId,
        teamId: member.teamId,
        delta: amount,
        reason: "POWER_STEAL",
        refType: "steal_to",
        refId: key,
        actorUserId: user.id,
        idempotencyKey: `score:steal-to:${key}`,
      });
    }

    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
