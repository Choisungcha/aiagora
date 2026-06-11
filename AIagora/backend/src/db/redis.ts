import Redis from "ioredis";

let client: Redis | null = null;

export function getRedis(): Redis | null {
  if (client) return client;

  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  try {
    client = new Redis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: true,
    });
    client.on("error", (err: Error) => {
      console.warn("[Redis] connection error:", err.message);
      client = null;
    });
    return client;
  } catch {
    return null;
  }
}

export async function setWithTtl(key: string, value: string, ttlSeconds: number): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.set(key, value, "EX", ttlSeconds);
}

export async function get(key: string): Promise<string | null> {
  const redis = getRedis();
  if (!redis) return null;
  return redis.get(key);
}

export async function del(key: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.del(key);
}
