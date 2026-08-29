import { z } from "zod";
import { Prisma } from "@prisma/client";
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
}).strict();

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
    if (!activity || activity.type !== "QUIZ" || !activity.quiz) throw new HttpError(404, "Quiz not found.");
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
    if (!question || question.quizId !== activity.quiz.id) throw new HttpError(404, "Question not found.");
    if (!question.current) throw new HttpError(403, "This question is not active.");
    const option = question.options.find((o) => o.id === body.optionId);
    if (!option) throw new HttpError(400, "Invalid option.");

    try {
      const result = await prisma.$transaction(async (tx) => {
        const teamExisting = await tx.quizSubmission.findUnique({
          where: { questionId_teamId: { questionId: question.id, teamId: member.teamId } },
        });
        if (teamExisting) {
          return {
            duplicate: true,
            correct: teamExisting.correct,
            pointsAwarded: teamExisting.userId === user.id ? teamExisting.pointsAwarded : 0,
          };
        }

        const correct = option.isCorrect;
        const points = correct ? question.points : 0;
        const submission = await tx.quizSubmission.create({
          data: {
            activityId: activity.id,
            questionId: question.id,
            userId: user.id,
            teamId: member.teamId,
            optionId: option.id,
            correct,
            pointsAwarded: points,
            idempotencyKey: key,
          },
        });
        return { duplicate: false, correct, pointsAwarded: points, submissionId: submission.id };
      });

      if (!result.duplicate && result.pointsAwarded > 0 && "submissionId" in result && result.submissionId) {
        await applyScore({
          roomId: activity.roomId,
          teamId: member.teamId,
          delta: result.pointsAwarded,
          reason: "QUIZ_RESULT",
          refType: "quiz_submission",
          refId: result.submissionId,
          actorUserId: user.id,
          idempotencyKey: `score:quiz:${question.id}:${member.teamId}`,
        });
      }

      return jsonOk({
        duplicate: result.duplicate,
        correct: result.correct,
        pointsAwarded: result.pointsAwarded,
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const existing = await prisma.quizSubmission.findUnique({
          where: { questionId_teamId: { questionId: question.id, teamId: member.teamId } },
        });
        return jsonOk({
          duplicate: true,
          correct: existing?.correct ?? false,
          pointsAwarded: existing?.userId === user.id ? existing.pointsAwarded : 0,
        });
      }
      throw e;
    }
  } catch (e) {
    return jsonError(e);
  }
}
