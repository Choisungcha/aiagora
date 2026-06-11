import Redis from "ioredis";
import { getRedis } from "../db/redis";

const BLACKLIST_PREFIX = "bl:";
const REPORT_PREFIX = "rpt:";
const REPORT_THRESHOLD = 3; // auto-blacklist at 3 reports

export async function isBlacklisted(did: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  const result = await redis.get(`${BLACKLIST_PREFIX}${did}`);
  return result === "1";
}

export async function addToBlacklist(did: string, reason = "manual"): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.set(`${BLACKLIST_PREFIX}${did}`, "1");
  console.log(`[Blacklist] ${did} blacklisted — reason: ${reason}`);
}

export async function removeFromBlacklist(did: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.del(`${BLACKLIST_PREFIX}${did}`);
}

/**
 * Records a report against a DID. Returns the new report count.
 * If count reaches REPORT_THRESHOLD, automatically blacklists the agent.
 */
export async function recordReport(
  targetDid: string,
  reporterDid: string,
  reason: string
): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;

  const reportKey = `${REPORT_PREFIX}${targetDid}`;
  const count = await redis.incr(reportKey);
  await redis.expire(reportKey, 30 * 24 * 3600); // 30-day window

  // Store reporter details (for audit)
  await redis.lpush(
    `${REPORT_PREFIX}${targetDid}:log`,
    JSON.stringify({ reporter: reporterDid, reason, ts: Date.now() })
  );
  await redis.ltrim(`${REPORT_PREFIX}${targetDid}:log`, 0, 99);

  if (count >= REPORT_THRESHOLD) {
    await addToBlacklist(targetDid, `${count} reports accumulated`);
  }

  return count;
}

export async function getReportCount(did: string): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;
  const val = await redis.get(`${REPORT_PREFIX}${did}`);
  return val ? parseInt(val, 10) : 0;
}
