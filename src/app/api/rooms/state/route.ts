import { prisma } from "@/lib/db";
import { jsonError, jsonOk, HttpError } from "@/lib/http";
import { requireUser } from "@/lib/request";
import { remainingMs } from "@/lib/timer";
import { publicCodingProblem, publicQuizQuestion } from "@/lib/access";

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const roomId = new URL(req.url).searchParams.get("roomId");
    if (!roomId) throw new HttpError(400, "roomId is required.");

    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        event: true,
        teams: { include: { members: { include: { user: true } } } },
        activities: { orderBy: { sortOrder: "asc" }, include: { quiz: { include: { questions: true } }, codingProblem: { include: { tests: true } } } },
      },
    });
    if (!room) throw new HttpError(404, "Room not found.");

    const isHost = user.role === "HOST" && room.event.hostId === user.id;
    const member = room.teams.flatMap((t) => t.members).find((m) => m.userId === user.id);
    if (!isHost && !member) throw new HttpError(403, "Not in this room.");

    const current = room.activities.find((a) => a.id === room.currentActivityId) ?? null;
    let question = null;
    let coding = null;
    if (current?.type === "QUIZ" && current.quiz) {
      const currentQ = current.quiz.questions.find((q) => q.current) ?? current.quiz.questions[0];
      if (currentQ) {
        if (isHost) {
          question = await prisma.quizQuestion.findUnique({
            where: { id: currentQ.id },
            include: { options: true },
          });
        } else {
          question = await publicQuizQuestion(currentQ.id);
        }
      }
    }
    if (current?.type === "CODING" && current.codingProblem) {
      coding = isHost
        ? current.codingProblem
        : publicCodingProblem(current.codingProblem);
    }

    const board = await prisma.leaderboardEntry.findMany({
      where: { roomId },
      orderBy: [{ score: "desc" }, { teamId: "asc" }],
    });

    const shop = await prisma.powerShopOffer.findMany({ where: { roomId, active: true } });

    return jsonOk({
      serverNow: Date.now(),
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
        })),
      })),
      activities: room.activities.map((a) => ({
        id: a.id,
        type: a.type,
        title: a.title,
        status: a.status,
        sortOrder: a.sortOrder,
        remainingMs: remainingMs(a),
        endsAt: a.endsAt,
      })),
      currentActivityId: room.currentActivityId,
      question,
      coding,
      leaderboard: board.map((row, i) => ({
        rank: i + 1,
        teamId: row.teamId,
        score: row.score,
        name: room.teams.find((t) => t.id === row.teamId)?.name ?? "Team",
        avatarSeed: room.teams.find((t) => t.id === row.teamId)?.avatarSeed ?? "alpha",
      })),
      shop,
    });
  } catch (e) {
    return jsonError(e);
  }
}
