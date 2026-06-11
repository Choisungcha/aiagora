import Redis from "ioredis";

// ── General-purpose client (GET/SET/ZADD 등) ──────────────────────────────────
let client: Redis | null = null;

// ── Pub/Sub 전용 클라이언트 (subscribe 모드에서는 일반 명령 불가) ──────────────
let pubClient: Redis | null = null;
let subClient: Redis | null = null;

function makeClient(url: string): Redis {
  const c = new Redis(url, {
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    lazyConnect: true,
  });
  c.on("error", (err: Error) => console.warn("[Redis] error:", err.message));
  return c;
}

export function getRedis(): Redis | null {
  if (client) return client;
  try {
    client = makeClient(process.env.REDIS_URL ?? "redis://localhost:6379");
    return client;
  } catch {
    return null;
  }
}

export function getPubClient(): Redis | null {
  if (pubClient) return pubClient;
  try {
    pubClient = makeClient(process.env.REDIS_URL ?? "redis://localhost:6379");
    return pubClient;
  } catch {
    return null;
  }
}

export function getSubClient(): Redis | null {
  if (subClient) return subClient;
  try {
    subClient = makeClient(process.env.REDIS_URL ?? "redis://localhost:6379");
    return subClient;
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
