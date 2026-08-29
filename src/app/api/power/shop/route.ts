import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk, HttpError } from "@/lib/http";
import { guardMutating, parseJson, requireHost, requireUser, idempotencyKey } from "@/lib/request";
import { requireHostOwnsRoom, requireMembership } from "@/lib/access";
import { purchasePowerCard } from "@/lib/power-shop";
import { emitRoom, audit } from "@/lib/realtime";
import { RealtimeEvent } from "@/lib/constants";

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    await guardMutating(req, `shop:${user.id}`, 30, 60);
    const body = z.object({ offerId: z.string(), roomId: z.string() }).parse(await parseJson(req));
    const member = await requireMembership(user.id, body.roomId);
    const team = await prisma.team.findUnique({ where: { id: member.teamId } });
    if (team?.freezeUntil && team.freezeUntil > new Date()) {
      throw new HttpError(403, "Your team is frozen.");
    }
    const result = await purchasePowerCard({
      offerId: body.offerId,
      teamId: member.teamId,
      userId: user.id,
      roomId: body.roomId,
      idempotencyKey: idempotencyKey(req, `buy:${member.teamId}:${body.offerId}`),
    });
    if (result.status === "sold_out") {
      return jsonOk({
        ok: false,
        message: "Good try! Cards aren't available this time. Try again next time!",
      });
    }
    return jsonOk({ ok: true, status: result.status });
  } catch (e) {
    return jsonError(e);
  }
}

export async function PUT(req: Request) {
  try {
    const host = await requireHost(req);
    await guardMutating(req, `shop-ctrl:${host.id}`, 40, 60);
    const body = z.object({
      roomId: z.string(),
      action: z.enum(["OPEN", "CLOSE"]),
      offers: z.array(z.object({
        cardType: z.enum(["STEAL", "DOUBLE_POINTS", "SHIELD", "FREEZE"]),
        cost: z.number().int().min(0),
        inventory: z.number().int().min(0).max(1000),
      })).optional(),
    }).parse(await parseJson(req));
    await requireHostOwnsRoom(host.id, body.roomId);

    if (body.action === "CLOSE") {
      await prisma.powerShopOffer.updateMany({ where: { roomId: body.roomId }, data: { active: false, closedAt: new Date() } });
      await prisma.room.update({ where: { id: body.roomId }, data: { shopEnabled: false } });
      await emitRoom(body.roomId, RealtimeEvent.POWER_SHOP_CLOSED, {});
      return jsonOk({ ok: true });
    }

    await prisma.powerShopOffer.updateMany({ where: { roomId: body.roomId }, data: { active: false } });
    const offers = body.offers ?? [
      { cardType: "STEAL" as const, cost: 200, inventory: 3 },
      { cardType: "DOUBLE_POINTS" as const, cost: 150, inventory: 3 },
      { cardType: "SHIELD" as const, cost: 120, inventory: 3 },
      { cardType: "FREEZE" as const, cost: 180, inventory: 3 },
    ];
    for (const o of offers) {
      await prisma.powerShopOffer.create({
        data: { roomId: body.roomId, cardType: o.cardType, cost: o.cost, inventory: o.inventory, active: true, openedAt: new Date() },
      });
    }
    await prisma.room.update({ where: { id: body.roomId }, data: { shopEnabled: true } });
    await audit({ roomId: body.roomId, actorId: host.id, action: "POWER_SHOP_OPENED" });
    await emitRoom(body.roomId, RealtimeEvent.POWER_SHOP_OPENED, { offers });
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
