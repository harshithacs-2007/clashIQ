import { Queue } from "bullmq";
import { getEnv } from "./env";
import { getRedis } from "./redis";
import { HttpError } from "./http";

let queue: Queue | null = null;

export function judgeQueue() {
  if (queue) return queue;
  const redis = getRedis();
  if (!redis) throw new HttpError(503, "Code judging is unavailable.");
  const env = getEnv();
  queue = new Queue(env.JUDGE_QUEUE_NAME, {
    connection: redis,
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  });
  return queue;
}

export async function enqueueJudge(submissionId: string, options: { runOnly?: boolean } = {}) {
  await judgeQueue().add(
    "judge",
    { submissionId, runOnly: options.runOnly === true },
    { jobId: submissionId, attempts: 5 },
  );
}
