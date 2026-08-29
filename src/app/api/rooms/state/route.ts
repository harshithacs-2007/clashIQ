import { prisma } from "@/lib/db";
import { jsonError, jsonOk, HttpError } from "@/lib/http";
import { requireUser } from "@/lib/request";
import { remainingMs } from "@/lib/timer";
import { publicCodingProblem, publicQuizQuestion } from "@/lib/access";

const QUIZ_VISIBLE = new Set(["ACTIVE", "PAUSED", "LOCKED", "ENDED"]);

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const roomId = new URL(req.url).searchParams.get("roomId");
    if (!roomId) throw new HttpError(400, "roomId is required.");

    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        event: true,
        teams: {
          include: {
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    displayName: true,
                    avatars: { select: { style: true, seed: true, config: true } },
                  },
                },
              },
            },
          },
        },
        activities: {
          orderBy: { sortOrder: "asc" },
          include: {
            quiz: { include: { questions: { orderBy: { sortOrder: "asc" } } } },
            codingProblem: { include: { tests: true } },
          },
        },
      },
    });
    if (!room) throw new HttpError(404, "Room not found.");

    const isHost = user.role === "HOST" && room.event.hostId === user.id;
    const member = room.teams.flatMap((t) => t.members).find((m) => m.userId === user.id);
    if (!isHost && !member) throw new HttpError(403, "Not in this room.");

    const current = room.activities.find((a) => a.id === room.currentActivityId) ?? null;
    let question = null;
    let coding = null;
    let instructions: string | null = null;
    let mySubmission: { optionId: string; questionId: string } | null = null;

    if (current?.type === "QUIZ" && current.quiz) {
      instructions = current.quiz.instructions || null;
      const live = QUIZ_VISIBLE.has(current.status);
      const currentQ = current.quiz.questions.find((q) => q.current) ?? null;
      if (live && currentQ) {
        const reveal = isHost || current.status === "LOCKED" || current.status === "ENDED";
        if (isHost) {
          question = await prisma.quizQuestion.findUnique({
            where: { id: currentQ.id },
            include: { options: { orderBy: { sortOrder: "asc" } } },
          });
        } else {
          question = await publicQuizQuestion(currentQ.id, reveal);
        }
        if (member) {
          const sub = await prisma.quizSubmission.findUnique({
            where: { questionId_teamId: { questionId: currentQ.id, teamId: member.teamId } },
          });
          if (sub) mySubmission = { optionId: sub.optionId, questionId: sub.questionId };
        }
      }
    }
    if (current?.type === "CODING" && current.codingProblem && QUIZ_VISIBLE.has(current.status)) {
      coding = isHost ? current.codingProblem : publicCodingProblem(current.codingProblem);
    }

    const board = await prisma.leaderboardEntry.findMany({
      where: { roomId },
      orderBy: [{ score: "desc" }, { teamId: "asc" }],
    });

    const shop = await prisma.powerShopOffer.findMany({ where: { roomId, active: true } });
    const serverNow = Date.now();

    return jsonOk({
      serverNow,
      room: {
        id: room.id,
        name: room.name,
        code: isHost ? room.code : undefined,
        status: room.status,
        teamSize: room.teamSize,
        shopEnabled: room.shopEnabled,
        challengesOn: room.challengesOn,
        joinsEnabled: room.joinsEnabled,
      },
      me: { id: user.id, role: isHost ? "HOST" : "PARTICIPANT", teamId: member?.teamId ?? null },
      teams: room.teams.map((t) => ({
        id: t.id,
        name: t.name,
        avatarSeed: t.avatarSeed,
        freezeUntil: t.freezeUntil,
        shieldUntil: t.shieldUntil,
        members: t.members.map((m) => ({
          id: m.user.id,
          displayName: m.user.displayName,
          avatar: m.user.avatars,
        })),
      })),
      activities: room.activities.map((a) => ({
        id: a.id,
        type: a.type,
        title: a.title,
        status: a.status,
        sortOrder: a.sortOrder,
        remainingMs: remainingMs(a, serverNow),
        endsAt: isHost ? a.endsAt : null,
        startedAt: isHost ? a.startedAt : null,
        pausedAt: isHost ? a.pausedAt : null,
      })),
      currentActivityId: room.currentActivityId,
      instructions,
      question,
      mySubmission,
      coding,
      leaderboard: board.map((row, i) => {
        const team = room.teams.find((t) => t.id === row.teamId);
        return {
          rank: i + 1,
          teamId: row.teamId,
          score: row.score,
          name: team?.name ?? "Team",
          avatarSeed: team?.avatarSeed ?? "alpha",
          avatars: (team?.members ?? []).map((m) => ({
            displayName: m.user.displayName,
            avatar: m.user.avatars,
          })),
        };
      }),
      shop,
    });
  } catch (e) {
    return jsonError(e);
  }
}
