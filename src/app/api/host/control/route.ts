import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk, HttpError } from "@/lib/http";
import { guardMutating, parseJson, requireHost } from "@/lib/request";
import { requireHostOwnsRoom } from "@/lib/access";
import { emitRoom, audit } from "@/lib/realtime";
import { RealtimeEvent } from "@/lib/constants";
import { remainingMs, computeEndsAt } from "@/lib/timer";
import { collectHealth } from "@/lib/health";

const controlSchema = z.object({
  roomId: z.string(),
  activityId: z.string().optional(),
  action: z.enum([
    "OPEN_ROOM",
    "LOCK_ROOM",
    "UNLOCK_ROOM",
    "CLOSE_ROOM",
    "PAUSE_ROOM",
    "RESUME_ROOM",
    "DISABLE_JOINS",
    "ENABLE_JOINS",
    "START",
    "PAUSE",
    "RESUME",
    "LOCK",
    "UNLOCK",
    "ADD_TIME",
    "END",
    "NEXT",
    "PUBLISH",
    "ACTIVATE",
  ]),
  extraMs: z.number().int().min(1000).max(30 * 60 * 1000).optional(),
});

export async function POST(req: Request) {
  try {
    const host = await requireHost(req);
    await guardMutating(req, `control:${host.id}`, 120, 60);
    const body = controlSchema.parse(await parseJson(req));
    const room = await requireHostOwnsRoom(host.id, body.roomId);

    switch (body.action) {
      case "OPEN_ROOM":
        await prisma.room.update({ where: { id: room.id }, data: { status: "OPEN", joinsEnabled: true } });
        await audit({ roomId: room.id, actorId: host.id, action: "HOST_OPENED_ROOM" });
        break;
      case "LOCK_ROOM":
      case "DISABLE_JOINS":
        await prisma.room.update({ where: { id: room.id }, data: { status: "LOCKED", joinsEnabled: false } });
        await audit({ roomId: room.id, actorId: host.id, action: "HOST_LOCKED_ROOM" });
        break;
      case "UNLOCK_ROOM":
      case "ENABLE_JOINS":
        await prisma.room.update({ where: { id: room.id }, data: { status: "OPEN", joinsEnabled: true } });
        break;
      case "CLOSE_ROOM":
        await prisma.room.update({ where: { id: room.id }, data: { status: "CLOSED", joinsEnabled: false } });
        break;
      case "PAUSE_ROOM":
        await prisma.room.update({ where: { id: room.id }, data: { status: "PAUSED" } });
        break;
      case "RESUME_ROOM":
        await prisma.room.update({ where: { id: room.id }, data: { status: "LIVE" } });
        break;
      default:
        await controlActivity(host.id, room.id, body);
    }

    await emitRoom(room.id, RealtimeEvent.ROOM_UPDATED, { action: body.action });
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}

async function controlActivity(
  hostId: string,
  roomId: string,
  body: z.infer<typeof controlSchema>,
) {
  const activityId = body.activityId;
  if (!activityId) throw new HttpError(400, "activityId is required for this control.");
  const activity = await prisma.activity.findUnique({ where: { id: activityId } });
  if (!activity || activity.roomId !== roomId) throw new HttpError(404, "Activity not found.");

  const now = new Date();

  if (body.action === "PUBLISH") {
    await prisma.activity.update({ where: { id: activityId }, data: { status: "PUBLISHED", publishedAt: now } });
    return;
  }

  if (body.action === "START" || body.action === "ACTIVATE") {
    const endsAt = computeEndsAt(now, activity.durationMs, activity.extraMs);
    await prisma.$transaction([
      prisma.activity.update({
        where: { id: activityId },
        data: { status: "ACTIVE", startedAt: now, pausedAt: null, endsAt },
      }),
      prisma.room.update({
        where: { id: roomId },
        data: { status: "LIVE", currentActivityId: activityId },
      }),
    ]);
    await audit({ roomId, actorId: hostId, action: "HOST_STARTED_ACTIVITY", payload: { activityId } });
    await emitRoom(roomId, RealtimeEvent.ACTIVITY_STARTED, { activityId, endsAt: endsAt.toISOString() });
    return;
  }

  if (body.action === "PAUSE") {
    await prisma.activity.update({
      where: { id: activityId },
      data: { status: "PAUSED", pausedAt: now },
    });
    await audit({ roomId, actorId: hostId, action: "HOST_PAUSED_ACTIVITY", payload: { activityId } });
    await emitRoom(roomId, RealtimeEvent.ACTIVITY_PAUSED, { activityId });
    return;
  }

  if (body.action === "RESUME") {
    const left = remainingMs(activity);
    const endsAt = new Date(now.getTime() + left);
    await prisma.activity.update({
      where: { id: activityId },
      data: { status: "ACTIVE", startedAt: now, pausedAt: null, endsAt, durationMs: left, extraMs: 0 },
    });
    await audit({ roomId, actorId: hostId, action: "HOST_RESUMED_ACTIVITY", payload: { activityId } });
    await emitRoom(roomId, RealtimeEvent.ACTIVITY_RESUMED, { activityId, endsAt: endsAt.toISOString() });
    return;
  }

  if (body.action === "LOCK") {
    await prisma.activity.update({ where: { id: activityId }, data: { status: "LOCKED" } });
    await audit({ roomId, actorId: hostId, action: "HOST_LOCKED_ACTIVITY", payload: { activityId } });
    await emitRoom(roomId, RealtimeEvent.ACTIVITY_LOCKED, { activityId });
    return;
  }

  if (body.action === "UNLOCK") {
    await prisma.activity.update({ where: { id: activityId }, data: { status: "ACTIVE" } });
    return;
  }

  if (body.action === "ADD_TIME") {
    const extra = body.extraMs ?? 30000;
    const current = await prisma.activity.findUniqueOrThrow({ where: { id: activityId } });
    const endsAt = current.endsAt ? new Date(current.endsAt.getTime() + extra) : computeEndsAt(now, current.durationMs, current.extraMs + extra);
    await prisma.activity.update({
      where: { id: activityId },
      data: { extraMs: current.extraMs + extra, endsAt },
    });
    await audit({ roomId, actorId: hostId, action: "HOST_ADDED_TIME", payload: { extra } });
    await emitRoom(roomId, RealtimeEvent.TIMER_UPDATED, { activityId, endsAt: endsAt.toISOString() });
    return;
  }

  if (body.action === "END") {
    await prisma.activity.update({ where: { id: activityId }, data: { status: "ENDED", endsAt: now } });
    await audit({ roomId, actorId: hostId, action: "HOST_ENDED_ACTIVITY", payload: { activityId } });
    await emitRoom(roomId, RealtimeEvent.ACTIVITY_ENDED, { activityId });
    return;
  }

  if (body.action === "NEXT") {
    const room = await prisma.room.findUniqueOrThrow({
      where: { id: roomId },
      include: { activities: { orderBy: { sortOrder: "asc" } } },
    });
    await prisma.activity.update({ where: { id: activityId }, data: { status: "ENDED" } });
    const idx = room.activities.findIndex((a) => a.id === activityId);
    const next = room.activities[idx + 1];
    if (!next) {
      await prisma.room.update({ where: { id: roomId }, data: { status: "CLOSED", currentActivityId: null } });
      await emitRoom(roomId, RealtimeEvent.ROOM_UPDATED, { action: "FINAL" });
      return;
    }
    const endsAt = computeEndsAt(now, next.durationMs, next.extraMs);
    await prisma.$transaction([
      prisma.activity.update({
        where: { id: next.id },
        data: { status: "ACTIVE", startedAt: now, endsAt },
      }),
      prisma.room.update({ where: { id: roomId }, data: { currentActivityId: next.id, status: "LIVE" } }),
    ]);
    await emitRoom(roomId, RealtimeEvent.ACTIVITY_STARTED, { activityId: next.id, endsAt: endsAt.toISOString() });
  }
}

export async function GET(req: Request) {
  try {
    const host = await requireHost(req);
    const health = await collectHealth();
    return jsonOk({ host: host.id, health });
  } catch (e) {
    return jsonError(e);
  }
}
