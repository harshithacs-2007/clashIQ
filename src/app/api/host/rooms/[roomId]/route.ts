import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { requireHost, guardMutating, parseJson } from "@/lib/request";
import { requireHostOwnsRoom } from "@/lib/access";
import { remainingMs } from "@/lib/timer";
import { collectHealth } from "@/lib/health";
import { z } from "zod";

export async function GET(req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    const host = await requireHost(req);
    const { roomId } = await ctx.params;
    const room = await requireHostOwnsRoom(host.id, roomId);
    const teams = await prisma.team.findMany({
      where: { roomId },
      include: {
        members: { include: { user: { select: { id: true, displayName: true, avatars: { select: { style: true, seed: true, config: true } } } } } },
        cards: true,
      },
    });
    const board = await prisma.leaderboardEntry.findMany({
      where: { roomId },
      orderBy: [{ score: "desc" }, { teamId: "asc" }],
    });
    const quizzes = await prisma.quiz.findMany({
      where: { activity: { roomId } },
      include: { questions: { include: { options: true } } },
    });
    const problems = await prisma.codingProblem.findMany({
      where: { activity: { roomId } },
      include: { tests: true },
    });
    const submissions = await prisma.codingSubmission.findMany({
      where: { activity: { roomId } },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { user: { select: { displayName: true } } },
    });
    const proctor = await prisma.proctoringSession.findMany({ where: { roomId } });
    const quizSubs = await prisma.quizSubmission.findMany({
      where: { activity: { roomId } },
      include: {
        user: { select: { displayName: true } },
        question: { select: { id: true, prompt: true, points: true, current: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const challenges = await prisma.challenge.findMany({ where: { roomId }, orderBy: { createdAt: "desc" }, take: 20 });
    const currentActivity = room.activities.find((a) => a.id === room.currentActivityId);
    const currentQuiz = currentActivity
      ? quizzes.find((q) => q.activityId === currentActivity.id)
      : undefined;
    const currentQuestion = currentQuiz?.questions.find((q) => q.current) ?? null;
    const progress = teams.map((t) => ({
      teamId: t.id,
      name: t.name,
      members: t.members.map((m) => m.user.displayName),
      avatars: t.members.map((m) => m.user.avatars),
      answered: quizSubs.filter((s) => s.teamId === t.id && currentActivity && s.activityId === currentActivity.id).length,
      total: currentQuiz?.questions.length ?? 0,
    }));
    const ranked = board.map((row, i) => ({
      rank: i + 1,
      teamId: row.teamId,
      score: row.score,
      name: teams.find((t) => t.id === row.teamId)?.name ?? "Team",
      avatars: teams.find((t) => t.id === row.teamId)?.members.map((m) => ({
        displayName: m.user.displayName,
        avatar: m.user.avatars,
      })) ?? [],
    }));
    const health = await collectHealth();
    const activities = room.activities.map((a) => ({ ...a, remainingMs: remainingMs(a) }));
    return jsonOk({
      room,
      teams,
      board: ranked,
      quizzes,
      problems,
      submissions: submissions.map((s) => ({
        id: s.id,
        status: s.status,
        pointsAwarded: s.pointsAwarded,
        user: s.user.displayName,
        createdAt: s.createdAt,
      })),
      quizSubmissions: quizSubs.map((s) => ({
        id: s.id,
        teamId: s.teamId,
        user: s.user.displayName,
        questionId: s.question.id,
        correct: s.correct,
        pointsAwarded: s.pointsAwarded,
      })),
      currentQuestion: currentQuestion
        ? { id: currentQuestion.id, prompt: currentQuestion.prompt }
        : null,
      progress,
      proctor,
      challenges,
      health,
      activities,
    });
  } catch (e) {
    return jsonError(e);
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    const host = await requireHost(req);
    await guardMutating(req, `room-edit:${host.id}`, 40, 60);
    const { roomId } = await ctx.params;
    await requireHostOwnsRoom(host.id, roomId);
    const body = z.object({
      name: z.string().min(2).max(80).trim().optional(),
      teamSize: z.number().int().min(2).max(3).optional(),
    }).parse(await parseJson(req));
    const room = await prisma.room.update({
      where: { id: roomId },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.teamSize ? { teamSize: body.teamSize } : {}),
      },
    });
    return jsonOk({ room });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    const host = await requireHost(req);
    await guardMutating(req, `room-del:${host.id}`, 20, 60);
    const { roomId } = await ctx.params;
    await requireHostOwnsRoom(host.id, roomId);
    await prisma.room.delete({ where: { id: roomId } });
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
