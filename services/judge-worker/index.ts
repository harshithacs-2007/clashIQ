import { Worker } from "bullmq";
import Redis from "ioredis";
import { PrismaClient, type SubmissionStatus } from "@prisma/client";

const prisma = new PrismaClient();
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const QUEUE = process.env.JUDGE_QUEUE_NAME ?? "clashiq-judge";
const JUDGE0_URL = process.env.JUDGE0_URL;
const JUDGE0_TOKEN = process.env.JUDGE0_AUTH_TOKEN;
const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

type Judge0Result = {
  stdout?: string | null;
  stderr?: string | null;
  compile_output?: string | null;
  status?: { id: number; description?: string };
  time?: string;
};

async function runJudge0(languageId: number, source: string, stdin: string, cpu: number, mem: number): Promise<Judge0Result> {
  if (!JUDGE0_URL) return { status: { id: 13, description: "Judge Unavailable" }, compile_output: "CODE_JUDGE not configured" };
  const res = await fetch(`${JUDGE0_URL.replace(/\/$/, "")}/submissions?base64_encoded=false&wait=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(JUDGE0_TOKEN ? { "X-Auth-Token": JUDGE0_TOKEN } : {}) },
    body: JSON.stringify({ language_id: languageId, source_code: source, stdin, cpu_time_limit: cpu, memory_limit: mem, max_processes_and_or_threads: 20, enable_network: false }),
  });
  if (!res.ok) return { status: { id: 13, description: "Internal Error" }, compile_output: "judge_http_error" };
  return (await res.json()) as Judge0Result;
}

function normalize(s: string) { return s.replace(/\r\n/g, "\n").trimEnd(); }

const worker = new Worker(QUEUE, async (job) => {
  const submissionId = job.data.submissionId as string;
  const sub = await prisma.codingSubmission.findUnique({
    where: { id: submissionId },
    include: { activity: { include: { codingProblem: { include: { tests: { orderBy: { sortOrder: "asc" } } } } } }, user: { include: { memberships: true } } },
  });
  if (!sub?.activity.codingProblem) return;
  await prisma.codingSubmission.update({ where: { id: sub.id }, data: { status: "RUNNING" } });

  const problem = sub.activity.codingProblem;
  let points = 0;
  let compile = "";
  let failedHard: SubmissionStatus | null = null;

  for (const test of problem.tests) {
    const result = await runJudge0(sub.languageId, sub.source, test.input, problem.cpuTimeLimit, problem.memoryLimitKb);
    compile = result.compile_output ?? compile;
    const statusId = result.status?.id ?? 13;
    const stdout = result.stdout ?? "";
    const passed = statusId === 3 && normalize(stdout) === normalize(test.expected);
    const award = passed ? test.points : 0;
    points += award;
    await prisma.testCaseResult.upsert({
      where: { submissionId_testCaseId: { submissionId: sub.id, testCaseId: test.id } },
      create: { submissionId: sub.id, testCaseId: test.id, passed, points: award, stdout: test.hidden ? "" : stdout.slice(0, 4000), stderr: test.hidden ? "" : (result.stderr ?? "").slice(0, 2000), timeMs: Math.round(Number(result.time ?? 0) * 1000) },
      update: { passed, points: award },
    });
    if (statusId === 6) failedHard = "COMPILE_ERROR";
    if (statusId === 5) failedHard = failedHard ?? "TIME_LIMIT";
    if (statusId === 13) failedHard = failedHard ?? "UNAVAILABLE";
  }

  const total = problem.tests.reduce((s, t) => s + t.points, 0);
  let status: SubmissionStatus = "WRONG_ANSWER";
  if (failedHard === "COMPILE_ERROR") status = "COMPILE_ERROR";
  else if (failedHard === "UNAVAILABLE") status = "UNAVAILABLE";
  else if (points === total && total > 0) status = "ACCEPTED";
  else if (points > 0) status = "PARTIAL";
  else if (failedHard) status = failedHard;

  await prisma.codingSubmission.update({ where: { id: sub.id }, data: { status, pointsAwarded: points, compileOutput: compile.slice(0, 4000), judgedAt: new Date() } });

  if (points > 0) {
    const member = await prisma.teamMember.findFirst({ where: { userId: sub.userId, team: { roomId: sub.activity.roomId } } });
    if (member) {
      const idempotencyKey = `score:code:${sub.id}`;
      await prisma.$transaction(async (tx) => {
        // PostgreSQL advisory transaction lock serializes concurrent submissions for
        // the same participant/activity while leaving unrelated submissions concurrent.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`${sub.activityId}:${sub.userId}`}))`;

        const existing = await tx.scoreTransaction.findUnique({ where: { idempotencyKey } });
        if (existing) return;

        const best = await tx.codingSubmission.aggregate({
          where: {
            activityId: sub.activityId,
            userId: sub.userId,
            id: { not: sub.id },
            status: { in: ["ACCEPTED", "PARTIAL"] },
          },
          _max: { pointsAwarded: true },
        });
        const previousBest = best._max.pointsAwarded ?? 0;
        const delta = Math.max(0, points - previousBest);
        if (delta === 0) return;

        await tx.scoreTransaction.create({
          data: { roomId: sub.activity.roomId, teamId: member.teamId, delta, reason: "CODING_RESULT", refType: "coding_submission", refId: sub.id, actorUserId: sub.userId, idempotencyKey },
        });
        await tx.leaderboardEntry.upsert({
          where: { roomId_teamId: { roomId: sub.activity.roomId, teamId: member.teamId } },
          create: { roomId: sub.activity.roomId, teamId: member.teamId, score: delta },
          update: { score: { increment: delta } },
        });
      });
    }
  }

  const redisPub = new Redis(REDIS_URL);
  await redisPub.publish(`room:${sub.activity.roomId}`, JSON.stringify({ event: "SUBMISSION_RESULT", roomId: sub.activity.roomId, at: new Date().toISOString(), data: { submissionId: sub.id, userId: sub.userId, status, pointsAwarded: points } }));
  await redisPub.quit();
}, { connection, concurrency: 4 });

worker.on("failed", (job, err) => console.error(JSON.stringify({ ts: new Date().toISOString(), msg: "judge_job_failed", jobId: job?.id, err: err.message })));
console.log(JSON.stringify({ ts: new Date().toISOString(), msg: "judge_worker_ready", queue: QUEUE }));
