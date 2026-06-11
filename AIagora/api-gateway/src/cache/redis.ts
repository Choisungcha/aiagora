import Redis from "ioredis";
import { GatewayResponse } from "../types";

const DEFAULT_TTL = 300; // 5 minutes

let client: Redis | null = null;

function getClient(): Redis | null {
  if (client) return client;

  const url = process.env.REDIS_URL || "redis://localhost:6379";
  try {
    client = new Redis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: true,
    });
    client.on("error", (err) => {
      if (process.env.NODE_ENV !== "test") {
        console.warn("[Redis] connection error — cache disabled:", err.message);
      }
      client = null;
    });
    return client;
  } catch {
    return null;
  }
}

export function buildCacheKey(route: string, params: Record<string, unknown>): string {
  const sorted = Object.keys(params)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = params[k];
      return acc;
    }, {});
  return `gw:${route}:${JSON.stringify(sorted)}`;
}

export async function getCached<T>(key: string): Promise<GatewayResponse<T> | null> {
  const redis = getClient();
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as GatewayResponse<T>) : null;
  } catch {
    return null;
  }
}

export async function setCache<T>(
  key: string,
  value: GatewayResponse<T>,
  ttl = DEFAULT_TTL
): Promise<void> {
  const redis = getClient();
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttl);
  } catch {
    // cache write failure is non-fatal
  }
}

export function wrapResponse<T>(
  source: string,
  data: T,
  affiliate: string | null = null,
  ttl = DEFAULT_TTL
): GatewayResponse<T> {
  return {
    source,
    data,
    affiliate,
    cachedAt: Date.now(),
    ttl,
  };
}
