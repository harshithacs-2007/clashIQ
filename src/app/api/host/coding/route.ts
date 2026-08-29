import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk, HttpError } from "@/lib/http";
import { guardMutating, parseJson, requireHost } from "@/lib/request";
import { requireHostOwnsRoom } from "@/lib/access";

const problemSchema = z.object({
  activityId: z.string(),
  description: z.string().min(1).max(20000),
  constraints: z.string().max(4000).default(""),
  inputFormat: z.string().max(4000).default(""),
  outputFormat: z.string().max(4000).default(""),
  examples: z.array(z.object({ input: z.string(), output: z.string() })).default([]),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  allowedLanguages: z.array(z.number().int()).min(1),
  starterCode: z.record(z.string(), z.string()),
  cpuTimeLimit: z.number().min(0.1).max(15).default(2),
  memoryLimitKb: z.number().int().min(16000).max(512000).default(128000),
  tests: z.array(z.object({
    input: z.string(),
    expected: z.string(),
    points: z.number().int().min(0).max(10000),
    hidden: z.boolean(),
  })).min(1),
});

export async function PUT(req: Request) {
  try {
    const host = await requireHost(req);
    await guardMutating(req, `coding:${host.id}`, 40, 60);
    const body = problemSchema.parse(await parseJson(req));
    const activity = await prisma.activity.findUnique({ where: { id: body.activityId }, include: { codingProblem: true } });
    if (!activity?.codingProblem) throw new HttpError(404, "Coding activity not found.");
    await requireHostOwnsRoom(host.id, activity.roomId);

    await prisma.$transaction(async (tx) => {
      await tx.codingProblem.update({
        where: { id: activity.codingProblem!.id },
        data: {
          description: body.description,
          constraints: body.constraints,
          inputFormat: body.inputFormat,
          outputFormat: body.outputFormat,
          examples: body.examples,
          difficulty: body.difficulty,
          allowedLanguages: body.allowedLanguages,
          starterCode: body.starterCode,
          cpuTimeLimit: body.cpuTimeLimit,
          memoryLimitKb: body.memoryLimitKb,
        },
      });
      await tx.codingTestCase.deleteMany({ where: { problemId: activity.codingProblem!.id } });
      await tx.codingTestCase.createMany({
        data: body.tests.map((t, i) => ({
          problemId: activity.codingProblem!.id,
          input: t.input,
          expected: t.expected,
          points: t.points,
          hidden: t.hidden,
          sortOrder: i,
        })),
      });
    });
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
