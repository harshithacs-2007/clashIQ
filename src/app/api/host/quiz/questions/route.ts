import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk, HttpError } from "@/lib/http";
import { guardMutating, parseJson, requireHost } from "@/lib/request";
import { requireHostOwnsRoom } from "@/lib/access";

const questionSchema = z.object({
  activityId: z.string(),
  prompt: z.string().min(1).max(2000),
  explanation: z.string().max(2000).default(""),
  points: z.number().int().min(1).max(10000).default(100),
  timeLimitMs: z.number().int().min(3000).max(300000).default(20000),
  options: z.array(z.object({ label: z.string().min(1).max(400), isCorrect: z.boolean() })).min(2).max(8),
});

export async function POST(req: Request) {
  try {
    const host = await requireHost(req);
    await guardMutating(req, `quizq:${host.id}`, 60, 60);
    const body = questionSchema.parse(await parseJson(req));
    if (!body.options.some((o) => o.isCorrect)) throw new HttpError(400, "Mark at least one correct option.");
    const activity = await prisma.activity.findUnique({ where: { id: body.activityId }, include: { quiz: { include: { questions: true } } } });
    if (!activity) throw new HttpError(404, "Activity not found.");
    await requireHostOwnsRoom(host.id, activity.roomId);
    if (!activity.quiz) throw new HttpError(400, "Not a quiz activity.");
    const q = await prisma.quizQuestion.create({
      data: {
        quizId: activity.quiz.id,
        prompt: body.prompt,
        explanation: body.explanation,
        points: body.points,
        timeLimitMs: body.timeLimitMs,
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
      questionId: z.string(),
      current: z.boolean().optional(),
      duplicate: z.boolean().optional(),
      delete: z.boolean().optional(),
    }).parse(await parseJson(req));
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
          sortOrder: question.sortOrder + 1,
          options: { create: question.options.map((o) => ({ label: o.label, isCorrect: o.isCorrect, sortOrder: o.sortOrder })) },
        },
      });
      return jsonOk({ question: copy });
    }
    if (body.current) {
      await prisma.quizQuestion.updateMany({ where: { quizId: question.quizId }, data: { current: false } });
      await prisma.quizQuestion.update({ where: { id: question.id }, data: { current: true } });
    }
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
