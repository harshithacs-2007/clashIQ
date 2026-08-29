import { getRedis } from "./redis";

export async function rateLimit(opts: {
  key: string;
  limit: number;
  windowSec: number;
}): Promise<{ ok: boolean; remaining: number; reset: number }> {
  const redis = getRedis();
  const k = `rl:${opts.key}`;
  const count = await redis.incr(k);
  if (count === 1) {
    await redis.expire(k, opts.windowSec);
  }
  const ttl = await redis.ttl(k);
  const remaining = Math.max(0, opts.limit - count);
  return { ok: count <= opts.limit, remaining, reset: ttl };
}
