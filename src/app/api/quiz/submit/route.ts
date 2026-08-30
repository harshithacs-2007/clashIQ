import { randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk, HttpError } from "@/lib/http";
import { guardMutating, parseJson, requireUser, idempotencyKey } from "@/lib/request";
import { requireMembership } from "@/lib/access";
import { enqueueJudge } from "@/lib/judge-queue";
import { remainingMs } from "@/lib/timer";

const schema = z.object({
  activityId: z.string(),
  languageId: z.number().int(),
  source: z.string().min(1).max(200_000),
  runOnly: z.boolean().default(false),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    await guardMutating(req, `code-sub:${user.id}`, 20, 60);
    const body = schema.parse(await parseJson(req));
    const activity = await prisma.activity.findUnique({
      where: { id: body.activityId },
      include: { codingProblem: true },
    });
    if (!activity?.codingProblem) throw new HttpError(404, "Coding round not found.");
    if (activity.status !== "ACTIVE") throw new HttpError(403, "Coding round is not accepting submissions.");
    if (remainingMs(activity) <= 0) throw new HttpError(403, "Time is up.");
    await requireMembership(user.id, activity.roomId);

    const langs = activity.codingProblem.allowedLanguages as number[];
    if (!langs.includes(body.languageId)) throw new HttpError(400, "Language not allowed.");

    // Fallback only fires for a caller that omits the Idempotency-Key header
    // (there is no such caller in this app's own frontend anymore). It must
    // not depend on Date.now(): a millisecond timestamp does not survive a
    // client retry and would silently defeat deduplication.
    const key = idempotencyKey(req, `code:${user.id}:${activity.id}:${randomUUID()}`);

    // Check-then-create so a genuine retry (same key, e.g. from the api()
    // client's CSRF-refresh retry) returns the original submission instead
    // of hitting the DB's unique constraint on idempotencyKey and 500'ing.
    const existing = await prisma.codingSubmission.findUnique({ where: { idempotencyKey: key } });
    if (existing) {
      return jsonOk({ submissionId: existing.id, status: existing.status, runOnly: body.runOnly }, 202);
    }

    let submission;
    try {
      submission = await prisma.codingSubmission.create({
        data: {
          activityId: activity.id,
          userId: user.id,
          languageId: body.languageId,
          source: body.source,
          status: "QUEUED",
          idempotencyKey: key,
        },
      });
    } catch (createErr) {
      // Two truly simultaneous retries can both pass the findUnique check
      // above before either commits. The unique constraint on
      // idempotencyKey is the real guarantee; if it fires, the other
      // request won the race — fetch and return its submission instead of
      // creating a duplicate.
      const isUniqueViolation =
        typeof createErr === "object" && createErr !== null && (createErr as { code?: string }).code === "P2002";
      if (!isUniqueViolation) throw createErr;
      const winner = await prisma.codingSubmission.findUnique({ where: { idempotencyKey: key } });
      if (!winner) throw createErr;
      return jsonOk({ submissionId: winner.id, status: winner.status, runOnly: body.runOnly }, 202);
    }
    await enqueueJudge(submission.id, { runOnly: body.runOnly });
    return jsonOk({ submissionId: submission.id, status: "QUEUED", runOnly: body.runOnly }, 202);
  } catch (e) {
    return jsonError(e);
  }
}

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new HttpError(400, "id is required.");
    const sub = await prisma.codingSubmission.findUnique({
      where: { id },
      include: { results: { include: { testCase: true } } },
    });
    if (!sub || sub.userId !== user.id) throw new HttpError(404, "Submission not found.");
    return jsonOk({
      id: sub.id,
      status: sub.status,
      pointsAwarded: sub.pointsAwarded,
      compileOutput: sub.compileOutput,
      results: sub.results.map((r) => ({
        passed: r.passed,
        points: r.points,
        hidden: r.testCase.hidden,
        timeMs: r.timeMs,
        stdout: r.testCase.hidden ? undefined : r.stdout,
      })),
    });
  } catch (e) {
    return jsonError(e);
  }
}
