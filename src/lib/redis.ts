import Redis from "ioredis";
import { log } from "./logger";

const globalForRedis = globalThis as unknown as { redis?: Redis | null };

function redisUrl(): string | undefined {
  const v = process.env.REDIS_URL?.trim();
  return v ? v : undefined;
}

export function getRedis(): Redis | null {
  if (globalForRedis.redis === null) return null;
  if (globalForRedis.redis) return globalForRedis.redis;
  const url = redisUrl();
  if (!url) {
    globalForRedis.redis = null;
    return null;
  }
  const client = new Redis(url, {
    maxRetriesPerRequest: 1,
    connectTimeout: 2500,
    enableReadyCheck: true,
    lazyConnect: true,
  });
  client.on("error", (err) => {
    log.warn("redis_error", { err: err.message });
  });
  globalForRedis.redis = client;
  return client;
}

export async function publishRealtime(channel: string, payload: unknown) {
  const redis = getRedis();
  if (!redis) {
    log.warn("realtime_publish_skipped", { channel });
    return;
  }
  try {
    if (redis.status === "wait") await redis.connect();
    await redis.publish(channel, JSON.stringify(payload));
  } catch (e) {
    log.warn("realtime_publish_failed", { err: e instanceof Error ? e.message : "unknown" });
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (!redis) return null;
  if (redis.status === "wait") await redis.connect();
  const raw = await redis.get(key);
  if (!raw) return null;
  return JSON.parse(raw) as T;
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number) {
  const redis = getRedis();
  if (!redis) return;
  if (redis.status === "wait") await redis.connect();
  await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
}
