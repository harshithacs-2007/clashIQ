import Redis from "ioredis";
import { getEnv } from "./env";

const globalForRedis = globalThis as unknown as { redis?: Redis };

export function getRedis(): Redis {
  if (globalForRedis.redis) return globalForRedis.redis;
  const client = new Redis(getEnv().REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  });
  globalForRedis.redis = client;
  return client;
}

export async function publishRealtime(channel: string, payload: unknown) {
  await getRedis().publish(channel, JSON.stringify(payload));
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const raw = await getRedis().get(key);
  if (!raw) return null;
  return JSON.parse(raw) as T;
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number) {
  await getRedis().set(key, JSON.stringify(value), "EX", ttlSeconds);
}
