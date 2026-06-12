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

const REDIS_URL = process.env.REDIS_URL || (process.env.NODE_ENV !== "production" ? "redis://localhost:6379" : "");

export function getRedis(): Redis | null {
  if (!REDIS_URL) return null; // Railway 등 Redis 미설정 시 graceful skip
  if (client) return client;
  try {
    client = makeClient(REDIS_URL);
    client.on("error", () => { client = null; });
    return client;
  } catch {
    return null;
  }
}

export function getPubClient(): Redis | null {
  if (!REDIS_URL) return null;
  if (pubClient) return pubClient;
  try {
    pubClient = makeClient(REDIS_URL);
    pubClient.on("error", () => { pubClient = null; });
    return pubClient;
  } catch {
    return null;
  }
}

export function getSubClient(): Redis | null {
  if (!REDIS_URL) return null;
  if (subClient) return subClient;
  try {
    subClient = makeClient(REDIS_URL);
    subClient.on("error", () => { subClient = null; });
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
