import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk, HttpError } from "@/lib/http";
import { guardMutating, parseJson, requireHost } from "@/lib/request";
import { requireHostOwnsRoom } from "@/lib/access";
import { emitRoom } from "@/lib/realtime";
import { RealtimeEvent } from "@/lib/constants";
import { quizQuestionSchema, quizOptionSchema } from "@/lib/validation";

export async function GET(req: Request) {
  try {
    const host = await requireHost(req);
    const activityId = new URL(req.url).searchParams.get("activityId");
    if (!activityId) throw new HttpError(400, "activityId is required.");
    const activity = await prisma.activity.findUnique({
      where: { id: activityId },
      include: {
        quiz: { include: { questions: { orderBy: { sortOrder: "asc" }, include: { options: { orderBy: { sortOrder: "asc" } } } } } },
      },
    });
    if (!activity) throw new HttpError(404, "Activity not found.");
    await requireHostOwnsRoom(host.id, activity.roomId);
    if (!activity.quiz) throw new HttpError(400, "Not a quiz activity.");
    return jsonOk({
      activity: { id: activity.id, title: activity.title, durationMs: activity.durationMs, status: activity.status },
      instructions: activity.quiz.instructions,
      questions: activity.quiz.questions,
    });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const host = await requireHost(req);
    await guardMutating(req, `quizq:${host.id}`, 60, 60);
    const body = quizQuestionSchema.parse(await parseJson(req));
    if (!body.options.some((o) => o.isCorrect)) throw new HttpError(400, "Mark at least one correct option.");
    const activity = await prisma.activity.findUnique({
      where: { id: body.activityId },
      include: { quiz: { include: { questions: true } } },
    });
    if (!activity) throw new HttpError(404, "Activity not found.");
    await requireHostOwnsRoom(host.id, activity.roomId);
    if (!activity.quiz) throw new HttpError(400, "Not a quiz activity.");
    if (body.imageId) {
      const media = await prisma.uploadedMedia.findUnique({ where: { id: body.imageId } });
      if (!media || (media.roomId && media.roomId !== activity.roomId) || media.uploaderId !== host.id) {
        throw new HttpError(403, "Image is not available for this room.");
      }
    }
    const q = await prisma.quizQuestion.create({
      data: {
        quizId: activity.quiz.id,
        prompt: body.prompt,
        explanation: body.explanation,
        points: body.points,
        timeLimitMs: body.timeLimitMs,
        imageId: body.imageId,
        sortOrder: (activity.quiz.questions.at(-1)?.sortOrder ?? 0) + 10,
        options: {
          create: body.options.map((o, i) => ({ label: o.label, isCorrect: o.isCorrect, sortOrder: i })),
        },
      },
      include: { options: true },
    });
    return jsonOk({ question: q }, 201);
  } catch (e) {
    return jsonError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const host = await requireHost(req);
    await guardMutating(req, `quizq-edit:${host.id}`, 80, 60);
    const body = z.object({
      questionId: z.string().optional(),
      activityId: z.string().optional(),
      current: z.boolean().optional(),
      duplicate: z.boolean().optional(),
      delete: z.boolean().optional(),
      orderedIds: z.array(z.string()).optional(),
      prompt: z.string().min(1).max(2000).optional(),
      explanation: z.string().max(2000).optional(),
      points: z.number().int().min(1).max(10000).optional(),
      timeLimitMs: z.number().int().min(3000).max(300000).optional(),
      imageId: z.string().nullable().optional(),
      options: z.array(quizOptionSchema).min(2).max(8).optional(),
    }).parse(await parseJson(req));

    if (body.orderedIds && body.activityId) {
      const activity = await prisma.activity.findUnique({ where: { id: body.activityId }, include: { quiz: { include: { questions: true } } } });
      if (!activity?.quiz) throw new HttpError(404, "Quiz not found.");
      await requireHostOwnsRoom(host.id, activity.roomId);
      const owned = new Set(activity.quiz.questions.map((q) => q.id));
      if (body.orderedIds.some((id) => !owned.has(id))) throw new HttpError(403, "You do not have access to this resource.");
      await prisma.$transaction(
        body.orderedIds.map((id, i) =>
          prisma.quizQuestion.updateMany({ where: { id, quizId: activity.quiz!.id }, data: { sortOrder: (i + 1) * 10 } }),
        ),
      );
      return jsonOk({ ok: true });
    }

    if (!body.questionId) throw new HttpError(400, "questionId is required.");
    const question = await prisma.quizQuestion.findUnique({
      where: { id: body.questionId },
      include: { quiz: { include: { activity: true, questions: { include: { options: true } } } }, options: true },
    });
    if (!question) throw new HttpError(404, "Question not found.");
    await requireHostOwnsRoom(host.id, question.quiz.activity.roomId);

    if (body.delete) {
      await prisma.quizQuestion.delete({ where: { id: question.id } });
      return jsonOk({ ok: true });
    }
    if (body.duplicate) {
      const copy = await prisma.quizQuestion.create({
        data: {
          quizId: question.quizId,
          prompt: `${question.prompt} (copy)`,
          explanation: question.explanation,
          points: question.points,
          timeLimitMs: question.timeLimitMs,
          imageId: question.imageId,
          sortOrder: question.sortOrder + 1,
          options: { create: question.options.map((o) => ({ label: o.label, isCorrect: o.isCorrect, sortOrder: o.sortOrder })) },
        },
        include: { options: true },
      });
      return jsonOk({ question: copy });
    }
    if (body.current) {
      await prisma.quizQuestion.updateMany({ where: { quizId: question.quizId }, data: { current: false } });
      await prisma.quizQuestion.update({ where: { id: question.id }, data: { current: true } });
      await emitRoom(question.quiz.activity.roomId, RealtimeEvent.QUESTION_CHANGED, { questionId: question.id });
      return jsonOk({ ok: true });
    }
    if (body.options && !body.options.some((o) => o.isCorrect)) {
      throw new HttpError(400, "Mark at least one correct option.");
    }
    if (body.options) {
      const answered = await prisma.quizSubmission.count({ where: { questionId: question.id } });
      if (answered > 0) throw new HttpError(409, "Cannot change options after answers exist.");
      await prisma.$transaction([
        prisma.quizOption.deleteMany({ where: { questionId: question.id } }),
        ...body.options.map((o, i) =>
          prisma.quizOption.create({
            data: { questionId: question.id, label: o.label, isCorrect: o.isCorrect, sortOrder: i },
          }),
        ),
      ]);
    }
    const updated = await prisma.quizQuestion.update({
      where: { id: question.id },
      data: {
        ...(body.prompt ? { prompt: body.prompt } : {}),
        ...(body.explanation !== undefined ? { explanation: body.explanation } : {}),
        ...(body.points ? { points: body.points } : {}),
        ...(body.timeLimitMs ? { timeLimitMs: body.timeLimitMs } : {}),
        ...(body.imageId !== undefined ? { imageId: body.imageId } : {}),
      },
      include: { options: { orderBy: { sortOrder: "asc" } } },
    });
    return jsonOk({ question: updated });
  } catch (e) {
    return jsonError(e);
  }
}
