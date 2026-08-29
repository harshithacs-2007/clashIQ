import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { requireHost } from "@/lib/request";
import { requireHostOwnsRoom } from "@/lib/access";
import { remainingMs } from "@/lib/timer";
import { collectHealth } from "@/lib/health";

export async function GET(req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    const host = await requireHost(req);
    const { roomId } = await ctx.params;
    const room = await requireHostOwnsRoom(host.id, roomId);
    const teams = await prisma.team.findMany({
      where: { roomId },
      include: { members: { include: { user: true } }, cards: true },
    });
    const board = await prisma.leaderboardEntry.findMany({
      where: { roomId },
      orderBy: { score: "desc" },
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
      include: { user: true },
    });
    const proctor = await prisma.proctoringSession.findMany({ where: { roomId } });
    const challenges = await prisma.challenge.findMany({ where: { roomId }, orderBy: { createdAt: "desc" }, take: 20 });
    const health = await collectHealth();
    const activities = room.activities.map((a) => ({ ...a, remainingMs: remainingMs(a) }));
    return jsonOk({
      room,
      teams,
      board,
      quizzes,
      problems,
      submissions: submissions.map((s) => ({
        id: s.id,
        status: s.status,
        pointsAwarded: s.pointsAwarded,
        user: s.user.displayName,
        createdAt: s.createdAt,
      })),
      proctor,
      challenges,
      health,
      activities,
    });
  } catch (e) {
    return jsonError(e);
  }
}
