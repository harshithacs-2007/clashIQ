import "server-only";
import { prisma } from "./db";
import { publishRealtime } from "./redis";
import { realtimeChannels, type RealtimeEventName } from "./constants";

export async function emitRoom(roomId: string, event: RealtimeEventName | string, data: unknown, hostOnly = false) {
  const envelope = { event, roomId, at: new Date().toISOString(), data };
  const channel = hostOnly ? realtimeChannels.host(roomId) : realtimeChannels.room(roomId);
  await publishRealtime(channel, envelope);
}

export async function audit(opts: {
  roomId?: string | null;
  actorId?: string | null;
  action: string;
  payload?: unknown;
}) {
  await prisma.auditEvent.create({
    data: {
      roomId: opts.roomId ?? null,
      actorId: opts.actorId ?? null,
      action: opts.action,
      payload: (opts.payload ?? {}) as object,
    },
  });
}
