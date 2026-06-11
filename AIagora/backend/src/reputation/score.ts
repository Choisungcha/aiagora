import { getRedis } from "../db/redis";
import { getReputationScore, isAgentActiveOnChain } from "../bridge/onchain";

const SCORE_CACHE_TTL = 60; // 1 minute

export async function getCachedScore(did: string): Promise<number> {
  const redis = getRedis();
  const cacheKey = `rep:${did}`;

  if (redis) {
    const cached = await redis.get(cacheKey);
    if (cached !== null) return parseInt(cached, 10);
  }

  const score = await getReputationScore(did);

  if (redis) {
    await redis.set(cacheKey, String(score), "EX", SCORE_CACHE_TTL);
  }

  return score;
}

export async function invalidateScoreCache(did: string): Promise<void> {
  const redis = getRedis();
  if (redis) await redis.del(`rep:${did}`);
}

export async function getAgentStatus(did: string): Promise<{
  did: string;
  score: number;
  isActive: boolean;
}> {
  const [score, isActive] = await Promise.all([
    getCachedScore(did),
    isAgentActiveOnChain(did),
  ]);
  return { did, score, isActive };
}
