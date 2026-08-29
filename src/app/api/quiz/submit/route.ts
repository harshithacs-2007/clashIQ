import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk, HttpError } from "@/lib/http";
import { guardMutating, parseJson, requireUser, idempotencyKey } from "@/lib/request";
import { requireMembership } from "@/lib/access";
import { applyScore } from "@/lib/scoring";
import { remainingMs } from "@/lib/timer";

const schema = z.object({
  activityId: z.string(),
  questionId: z.string(),
  optionId: z.string(),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    await guardMutating(req, `quiz-sub:${user.id}`, 40, 60);
    const body = schema.parse(await parseJson(req));
    const key = idempotencyKey(req, `quiz:${user.id}:${body.questionId}`);

    const activity = await prisma.activity.findUnique({
      where: { id: body.activityId },
      include: { quiz: true },
    });
    if (!activity || activity.type !== "QUIZ") throw new HttpError(404, "Quiz not found.");
    if (activity.status === "LOCKED" || activity.status === "ENDED" || activity.status === "PAUSED") {
      throw new HttpError(403, "This quiz is locked.");
    }
    if (activity.status !== "ACTIVE") throw new HttpError(403, "Quiz is not live.");
    if (remainingMs(activity) <= 0) throw new HttpError(403, "Time is up.");

    const member = await requireMembership(user.id, activity.roomId);
    const question = await prisma.quizQuestion.findUnique({
      where: { id: body.questionId },
      include: { options: true },
    });
    if (!question || question.quizId !== activity.quiz?.id) throw new HttpError(404, "Question not found.");
    const option = question.options.find((o) => o.id === body.optionId);
    if (!option) throw new HttpError(400, "Invalid option.");

    const existing = await prisma.quizSubmission.findUnique({
      where: { questionId_userId: { questionId: question.id, userId: user.id } },
    });
    if (existing) {
      return jsonOk({ duplicate: true, correct: existing.correct, pointsAwarded: existing.pointsAwarded });
    }

    const correct = option.isCorrect;
    const points = correct ? question.points : 0;
    const submission = await prisma.quizSubmission.create({
      data: {
        activityId: activity.id,
        questionId: question.id,
        userId: user.id,
        optionId: option.id,
        correct,
        pointsAwarded: points,
        idempotencyKey: key,
      },
    });

    if (points > 0) {
      await applyScore({
        roomId: activity.roomId,
        teamId: member.teamId,
        delta: points,
        reason: "QUIZ_RESULT",
        refType: "quiz_submission",
        refId: submission.id,
        actorUserId: user.id,
        idempotencyKey: `score:${key}`,
      });
    }

    return jsonOk({
      correct,
      pointsAwarded: points,
    });
  } catch (e) {
    return jsonError(e);
  }
}
