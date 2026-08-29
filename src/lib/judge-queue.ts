import { Queue } from "bullmq";
import { getEnv } from "./env";
import { getRedis } from "./redis";

let queue: Queue | null = null;

export function judgeQueue() {
  if (queue) return queue;
  const env = getEnv();
  queue = new Queue(env.JUDGE_QUEUE_NAME, {
    connection: getRedis(),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  });
  return queue;
}

export async function enqueueJudge(submissionId: string) {
  await judgeQueue().add(
    "judge",
    { submissionId },
    { jobId: submissionId, attempts: 5 },
  );
}
