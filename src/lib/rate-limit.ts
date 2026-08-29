import { getRedis } from "./redis";
import { log } from "./logger";

export async function rateLimit(opts: {
  key: string;
  limit: number;
  windowSec: number;
}): Promise<{ ok: boolean; remaining: number; reset: number }> {
  const redis = getRedis();
  if (!redis) {
    return { ok: true, remaining: opts.limit, reset: opts.windowSec };
  }
  try {
    if (redis.status === "wait") await redis.connect();
    const k = `rl:${opts.key}`;
    const count = await redis.incr(k);
    if (count === 1) {
      await redis.expire(k, opts.windowSec);
    }
    const ttl = await redis.ttl(k);
    const remaining = Math.max(0, opts.limit - count);
    return { ok: count <= opts.limit, remaining, reset: ttl > 0 ? ttl : opts.windowSec };
  } catch (e) {
    log.warn("rate_limit_redis_unavailable", { err: e instanceof Error ? e.message : "unknown" });
    return { ok: true, remaining: opts.limit, reset: opts.windowSec };
  }
}
