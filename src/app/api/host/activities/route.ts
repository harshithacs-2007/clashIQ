import { z } from "zod";
import { Prisma } from "@prisma/client";
import { activitySchema } from "@/lib/validation";
import { jsonError, jsonOk, HttpError } from "@/lib/http";
import { guardMutating, parseJson, requireHost } from "@/lib/request";
import { requireHostOwnsRoom } from "@/lib/access";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/realtime";

export async function POST(req: Request) {
  try {
    const host = await requireHost(req);
    await guardMutating(req, `activity:${host.id}`, 40, 60);
    const roomId = new URL(req.url).searchParams.get("roomId");
    if (!roomId) throw new HttpError(400, "roomId is required.");
    const room = await requireHostOwnsRoom(host.id, roomId);
    const body = activitySchema.parse(await parseJson(req));
    const last = room.activities.at(-1);
    const activity = await prisma.activity.create({
      data: {
        roomId,
        type: body.type,
        title: body.title,
        durationMs: body.durationMs,
        sortOrder: (last?.sortOrder ?? 0) + 10,
        status: "DRAFT",
      },
    });
    if (body.type === "QUIZ") {
      await prisma.quiz.create({ data: { activityId: activity.id, instructions: body.instructions } });
    }
    if (body.type === "CODING") {
      await prisma.codingProblem.create({
        data: {
          activityId: activity.id,
          description: "Describe the problem.",
          examples: [],
          allowedLanguages: [71, 63, 62],
          starterCode: { 71: "print('hello')\n", 63: "console.log('hello')\n", 62: "class Main { public static void main(String[] a) {} }\n" },
        },
      });
    }
    await audit({ roomId, actorId: host.id, action: "HOST_CREATED_ACTIVITY", payload: { activityId: activity.id, type: body.type } });
    return jsonOk({ activity }, 201);
  } catch (e) {
    return jsonError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const host = await requireHost(req);
    await guardMutating(req, `activity-edit:${host.id}`, 40, 60);
    const body = z
      .object({
        roomId: z.string(),
        activityId: z.string(),
        action: z.enum(["DUPLICATE", "DELETE", "REORDER", "UPDATE"]),
        orderedIds: z.array(z.string()).optional(),
        title: z.string().min(2).max(80).trim().optional(),
        durationMs: z.number().int().min(5000).max(1000 * 60 * 180).optional(),
        instructions: z.string().max(4000).optional(),
      })
      .parse(await parseJson(req));
    const room = await requireHostOwnsRoom(host.id, body.roomId);
    const activity = room.activities.find((a) => a.id === body.activityId);
    if (!activity) throw new HttpError(404, "Activity not found.");

    if (body.action === "UPDATE") {
      const updated = await prisma.activity.update({
        where: { id: activity.id },
        data: {
          ...(body.title ? { title: body.title } : {}),
          ...(body.durationMs ? { durationMs: body.durationMs } : {}),
        },
      });
      if (activity.type === "QUIZ" && body.instructions !== undefined) {
        await prisma.quiz.update({
          where: { activityId: activity.id },
          data: { instructions: body.instructions },
        });
      }
      await audit({ roomId: room.id, actorId: host.id, action: "HOST_UPDATED_ACTIVITY", payload: { activityId: activity.id } });
      return jsonOk({ activity: updated });
    }

    if (body.action === "DELETE") {
      await prisma.activity.delete({ where: { id: activity.id } });
      await audit({ roomId: room.id, actorId: host.id, action: "HOST_DELETED_ACTIVITY", payload: { activityId: activity.id } });
      return jsonOk({ ok: true });
    }

    if (body.action === "REORDER") {
      const ids = body.orderedIds ?? [];
      if (ids.length === 0) throw new HttpError(400, "orderedIds is required.");
      const owned = new Set(room.activities.map((a) => a.id));
      if (ids.some((id) => !owned.has(id))) throw new HttpError(403, "You do not have access to this resource.");
      await prisma.$transaction(
        ids.map((id, i) =>
          prisma.activity.updateMany({
            where: { id, roomId: room.id },
            data: { sortOrder: (i + 1) * 10 },
          }),
        ),
      );
      return jsonOk({ ok: true });
    }

    const last = room.activities.at(-1);
    const copy = await prisma.activity.create({
      data: {
        roomId: room.id,
        type: activity.type,
        title: body.title ?? `${activity.title} copy`,
        durationMs: activity.durationMs,
        sortOrder: (last?.sortOrder ?? 0) + 10,
        status: "DRAFT",
      },
    });
    if (activity.type === "QUIZ") {
      const quiz = await prisma.quiz.findUnique({
        where: { activityId: activity.id },
        include: { questions: { include: { options: true } } },
      });
      if (quiz) {
        const qz = await prisma.quiz.create({ data: { activityId: copy.id, instructions: quiz.instructions } });
        for (const q of quiz.questions) {
          await prisma.quizQuestion.create({
            data: {
              quizId: qz.id,
              prompt: q.prompt,
              points: q.points,
              timeLimitMs: q.timeLimitMs,
              imageId: q.imageId,
              explanation: q.explanation,
              sortOrder: q.sortOrder,
              current: false,
              options: {
                create: q.options.map((o) => ({
                  label: o.label,
                  isCorrect: o.isCorrect,
                  sortOrder: o.sortOrder,
                })),
              },
            },
          });
        }
      }
    }
    if (activity.type === "CODING") {
      const problem = await prisma.codingProblem.findUnique({
        where: { activityId: activity.id },
        include: { tests: true },
      });
      if (problem) {
        const created = await prisma.codingProblem.create({
          data: {
            activityId: copy.id,
            description: problem.description,
            constraints: problem.constraints,
            inputFormat: problem.inputFormat,
            outputFormat: problem.outputFormat,
            examples: problem.examples as Prisma.InputJsonValue,
            difficulty: problem.difficulty,
            allowedLanguages: problem.allowedLanguages as Prisma.InputJsonValue,
            starterCode: problem.starterCode as Prisma.InputJsonValue,
          },
        });
        for (const t of problem.tests) {
          await prisma.codingTestCase.create({
            data: {
              problemId: created.id,
              input: t.input,
              expected: t.expected,
              points: t.points,
              hidden: t.hidden,
              sortOrder: t.sortOrder,
            },
          });
        }
      }
    }
    await audit({ roomId: room.id, actorId: host.id, action: "HOST_DUPLICATED_ACTIVITY", payload: { from: activity.id, to: copy.id } });
    return jsonOk({ activity: copy }, 201);
  } catch (e) {
    return jsonError(e);
  }
}
