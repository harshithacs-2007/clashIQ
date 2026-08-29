import "server-only";
import { prisma } from "./db";
import { HttpError } from "./http";
import { applyScore } from "./scoring";
import { emitRoom } from "./realtime";
import { RealtimeEvent } from "./constants";

export async function purchasePowerCard(opts: {
  offerId: string;
  teamId: string;
  userId: string;
  roomId: string;
  idempotencyKey: string;
}) {
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.powerCardPurchase.findUnique({
      where: { idempotencyKey: opts.idempotencyKey },
    });
    if (existing) {
      return { status: "duplicate" as const, purchase: existing };
    }

    const already = await tx.powerCardPurchase.findUnique({
      where: { offerId_teamId: { offerId: opts.offerId, teamId: opts.teamId } },
    });
    if (already) {
      return { status: "already" as const, purchase: already };
    }

    const updated = await tx.powerShopOffer.updateMany({
      where: { id: opts.offerId, active: true, inventory: { gt: 0 } },
      data: { inventory: { decrement: 1 } },
    });
    if (updated.count !== 1) {
      const offer = await tx.powerShopOffer.findUnique({ where: { id: opts.offerId } });
      if (!offer || !offer.active || offer.inventory <= 0) {
        return { status: "sold_out" as const };
      }
      throw new HttpError(409, "Could not complete purchase. Retry.");
    }

    const offer = await tx.powerShopOffer.findUniqueOrThrow({ where: { id: opts.offerId } });
    if (offer.roomId !== opts.roomId) {
      throw new HttpError(403, "Offer does not belong to this room.");
    }
    const board = await tx.leaderboardEntry.findUnique({
      where: { roomId_teamId: { roomId: opts.roomId, teamId: opts.teamId } },
    });
    if ((board?.score ?? 0) < offer.cost) {
      await tx.powerShopOffer.update({
        where: { id: opts.offerId },
        data: { inventory: { increment: 1 } },
      });
      throw new HttpError(400, "Not enough points.");
    }

    const purchase = await tx.powerCardPurchase.create({
      data: {
        offerId: opts.offerId,
        teamId: opts.teamId,
        userId: opts.userId,
        idempotencyKey: opts.idempotencyKey,
      },
    });

    await tx.teamPowerCard.upsert({
      where: { teamId_cardType: { teamId: opts.teamId, cardType: offer.cardType } },
      create: { teamId: opts.teamId, cardType: offer.cardType, quantity: 1 },
      update: { quantity: { increment: 1 } },
    });

    return { status: "ok" as const, purchase, cost: offer.cost, cardType: offer.cardType };
  });

  if (result.status === "sold_out") {
    await emitRoom(opts.roomId, RealtimeEvent.POWER_SHOP_SOLD_OUT, { teamId: opts.teamId });
    return result;
  }

  if (result.status === "ok") {
    await applyScore({
      roomId: opts.roomId,
      teamId: opts.teamId,
      delta: -result.cost,
      reason: "POWER_PURCHASE",
      refType: "power_purchase",
      refId: result.purchase.id,
      actorUserId: opts.userId,
      idempotencyKey: `score:${opts.idempotencyKey}`,
    });
    await emitRoom(opts.roomId, RealtimeEvent.POWER_CARD_PURCHASED, {
      teamId: opts.teamId,
      cardType: result.cardType,
    });
  }

  return result;
}
