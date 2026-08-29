import "server-only";
import type { ScoreReason } from "@prisma/client";
import { prisma } from "./db";
import { emitRoom } from "./realtime";
import { RealtimeEvent } from "./constants";

export async function applyScore(opts: {
  roomId: string;
  teamId: string;
  delta: number;
  reason: ScoreReason;
  refType: string;
  refId: string;
  actorUserId?: string;
  idempotencyKey: string;
}) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.scoreTransaction.findUnique({
      where: { idempotencyKey: opts.idempotencyKey },
    });
    if (existing) {
      const board = await tx.leaderboardEntry.findUnique({
        where: { roomId_teamId: { roomId: opts.roomId, teamId: opts.teamId } },
      });
      return { transaction: existing, score: board?.score ?? 0, duplicate: true };
    }

    const txRow = await tx.scoreTransaction.create({
      data: {
        roomId: opts.roomId,
        teamId: opts.teamId,
        delta: opts.delta,
        reason: opts.reason,
        refType: opts.refType,
        refId: opts.refId,
        actorUserId: opts.actorUserId,
        idempotencyKey: opts.idempotencyKey,
      },
    });

    const entry = await tx.leaderboardEntry.upsert({
      where: { roomId_teamId: { roomId: opts.roomId, teamId: opts.teamId } },
      create: { roomId: opts.roomId, teamId: opts.teamId, score: opts.delta },
      update: { score: { increment: opts.delta } },
    });

    return { transaction: txRow, score: entry.score, duplicate: false };
  }).then(async (result) => {
    if (!result.duplicate) {
      await emitLeaderboard(opts.roomId);
    }
    return result;
  });
}

export async function emitLeaderboard(roomId: string) {
  const rows = await prisma.leaderboardEntry.findMany({
    where: { roomId },
    orderBy: [{ score: "desc" }, { teamId: "asc" }],
  });
  const teams = await prisma.team.findMany({ where: { roomId } });
  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const board = rows.map((row, index) => ({
    rank: index + 1,
    teamId: row.teamId,
    name: teamMap.get(row.teamId)?.name ?? "Team",
    avatarSeed: teamMap.get(row.teamId)?.avatarSeed ?? "alpha",
    score: row.score,
  }));
  await emitRoom(roomId, RealtimeEvent.LEADERBOARD_UPDATED, { board });
  return board;
}

export async function teamScore(roomId: string, teamId: string): Promise<number> {
  const row = await prisma.leaderboardEntry.findUnique({
    where: { roomId_teamId: { roomId, teamId } },
  });
  return row?.score ?? 0;
}
