import * as crypto from "crypto";
import { getRedis } from "../db/redis";
import { KnowledgeEntry, KnowledgeCategory, KnowledgeVote } from "../types/agent";

// 카테고리별 기본 TTL (초)
const CATEGORY_TTL: Record<KnowledgeCategory, number> = {
  price:   3_600,   // 1시간 (가격은 빠르게 변함)
  market:    300,   // 5분 (주식/코인)
  trend:  86_400,   // 24시간
  deal:    1_800,   // 30분 (한정 특가)
  review: 604_800,  // 7일 (리뷰는 오래 유효)
  general: 21_600,  // 6시간
};

const MAX_PER_TOPIC = 20; // 주제당 최대 보관 항목 수

function makeId(): string {
  return crypto.randomBytes(8).toString("hex");
}

// ── Write ────────────────────────────────────────────────────────────────────

export async function saveKnowledge(
  partial: Omit<KnowledgeEntry, "id" | "timestamp" | "expiresAt" | "votes" | "sharedCount">
): Promise<KnowledgeEntry> {
  const redis = getRedis();
  const id = makeId();
  const now = Date.now();
  const ttlSec = CATEGORY_TTL[partial.category];
  const expiresAt = now + ttlSec * 1000;

  const entry: KnowledgeEntry = {
    ...partial,
    id,
    timestamp: now,
    expiresAt,
    votes: 0,
    sharedCount: 0,
  };

  if (!redis) return entry; // in-memory only if Redis unavailable

  const key = `knowledge:entry:${id}`;
  await redis.set(key, JSON.stringify(entry), "EX", ttlSec);

  // Topic index (sorted set, score = timestamp)
  const topicKey = `knowledge:topic:${entry.topic}`;
  await redis.zadd(topicKey, now, id);
  await redis.expire(topicKey, ttlSec * 2);
  // Keep only latest MAX_PER_TOPIC
  await redis.zremrangebyrank(topicKey, 0, -(MAX_PER_TOPIC + 1));

  // Category index
  const catKey = `knowledge:cat:${entry.category}`;
  await redis.zadd(catKey, now, id);
  await redis.expire(catKey, ttlSec * 2);
  await redis.zremrangebyrank(catKey, 0, -101); // keep latest 100

  return entry;
}

// ── Read ─────────────────────────────────────────────────────────────────────

export async function getKnowledgeById(id: string): Promise<KnowledgeEntry | null> {
  const redis = getRedis();
  if (!redis) return null;
  const raw = await redis.get(`knowledge:entry:${id}`);
  return raw ? (JSON.parse(raw) as KnowledgeEntry) : null;
}

export async function getKnowledgeByTopic(
  topic: string,
  limit = 10
): Promise<KnowledgeEntry[]> {
  const redis = getRedis();
  if (!redis) return [];
  const ids = await redis.zrevrange(`knowledge:topic:${topic}`, 0, limit - 1);
  return fetchEntries(ids);
}

export async function getKnowledgeByCategory(
  category: KnowledgeCategory,
  limit = 20
): Promise<KnowledgeEntry[]> {
  const redis = getRedis();
  if (!redis) return [];
  const ids = await redis.zrevrange(`knowledge:cat:${category}`, 0, limit - 1);
  return fetchEntries(ids);
}

export async function getRecentKnowledge(limit = 30): Promise<KnowledgeEntry[]> {
  const redis = getRedis();
  if (!redis) return [];

  // Merge across all categories into a global recency index
  const ids = await redis.zrevrange("knowledge:recent", 0, limit - 1);
  return fetchEntries(ids);
}

// ── Vote ─────────────────────────────────────────────────────────────────────

export async function voteKnowledge(vote: KnowledgeVote): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;

  const entry = await getKnowledgeById(vote.entryId);
  if (!entry) return 0;

  const delta = vote.valid ? 1 : -1;
  entry.votes += delta;

  const ttlSec = CATEGORY_TTL[entry.category];
  await redis.set(`knowledge:entry:${entry.id}`, JSON.stringify(entry), "EX", ttlSec);
  return entry.votes;
}

// ── Increment share count ─────────────────────────────────────────────────────

export async function incrementShareCount(id: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const entry = await getKnowledgeById(id);
  if (!entry) return;
  entry.sharedCount++;
  const ttlSec = CATEGORY_TTL[entry.category];
  await redis.set(`knowledge:entry:${id}`, JSON.stringify(entry), "EX", ttlSec);
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function fetchEntries(ids: string[]): Promise<KnowledgeEntry[]> {
  const redis = getRedis();
  if (!redis || ids.length === 0) return [];
  const raws = await Promise.all(ids.map((id) => redis.get(`knowledge:entry:${id}`)));
  return raws
    .filter((r): r is string => r !== null)
    .map((r) => JSON.parse(r) as KnowledgeEntry)
    .filter((e) => e.expiresAt > Date.now()); // 만료 항목 제외
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export async function getKnowledgeStats(): Promise<{
  totalEntries: number;
  byCategory: Record<string, number>;
}> {
  const redis = getRedis();
  if (!redis) return { totalEntries: 0, byCategory: {} };

  const categories: KnowledgeCategory[] = ["price", "trend", "market", "deal", "review", "general"];
  const counts = await Promise.all(
    categories.map((cat) => redis.zcard(`knowledge:cat:${cat}`))
  );

  const byCategory: Record<string, number> = {};
  let totalEntries = 0;
  categories.forEach((cat, i) => {
    byCategory[cat] = counts[i];
    totalEntries += counts[i];
  });

  return { totalEntries, byCategory };
}
