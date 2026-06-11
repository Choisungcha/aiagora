import { HubMessage, PendingOffer, KnowledgeEntry, KnowledgeCategory } from "../types/agent";
import { isBlacklisted } from "../blacklist/guard";
import { getRedis } from "../db/redis";
import { publish } from "./pubsub";
import { sendToSSE, getSSEClientCount } from "./sse";
import {
  saveKnowledge,
  getKnowledgeByTopic,
  getRecentKnowledge,
  voteKnowledge,
  incrementShareCount,
} from "../knowledge/store";

const OFFER_TTL_MS = 30_000;
const BROADCAST_STAKE_COST = 1;

export class MessageRouter {
  // Online agent presence (SSE connections tracked separately in sse.ts)
  public readonly clients = new Set<string>();

  private readonly pendingOffers = new Map<string, PendingOffer>();

  registerClient(did: string): void {
    this.clients.add(did);
    console.log(`[Hub] Connected: ${did} (${this.clients.size} total)`);
    void this.broadcastPresence(did, "join");
  }

  removeClient(did: string): void {
    this.clients.delete(did);
    console.log(`[Hub] Disconnected: ${did} (${this.clients.size} total)`);
    void this.broadcastPresence(did, "leave");
  }

  async handleMessage(raw: string, senderDid: string): Promise<void> {
    let message: HubMessage;
    try {
      message = JSON.parse(raw) as HubMessage;
    } catch {
      console.warn("[Hub] Malformed message from", senderDid);
      return;
    }

    // Server always overrides `from` — client cannot spoof identity
    message.from = senderDid;

    if (await isBlacklisted(senderDid)) {
      this.removeClient(senderDid);
      return;
    }

    switch (message.type) {
      case "broadcast":
        await this.handleBroadcast(message);
        break;
      case "negotiate":
      case "propose_bundle":
        this.trackOffer(message);
        await this.sendDirect(message);
        break;
      case "accept":
        this.cancelOffer(message.dealId);
        await this.sendDirect(message);
        break;
      case "reject":
        this.cancelOffer(message.dealId);
        await this.sendDirect(message);
        break;
      case "direct":
      case "join_bundle":
        await this.sendDirect(message);
        break;
      case "knowledge_share":
        await this.handleKnowledgeShare(message);
        break;
      case "knowledge_vote":
        await this.handleKnowledgeVote(message);
        break;
      case "knowledge_request":
        await this.handleKnowledgeRequest(message, senderDid);
        break;
      case "ping":
        await this.sendTo(senderDid, { type: "pong", from: "hub", content: {} });
        break;
      default:
        console.warn("[Hub] Unknown message type:", (message as HubMessage).type);
    }
  }

  private async handleBroadcast(message: HubMessage): Promise<void> {
    await this.deductStake(message.from, BROADCAST_STAKE_COST);
    await publish("hub:broadcast", message);
    console.log(`[Hub] Broadcast from ${message.from} → ${this.clients.size} agents`);
  }

  private async sendDirect(message: HubMessage): Promise<void> {
    if (!message.to) {
      console.warn("[Hub] direct/negotiate without `to` from", message.from);
      return;
    }
    await this.sendTo(message.to, message);
  }

  async sendTo(did: string, message: Partial<HubMessage>): Promise<void> {
    // Try direct SSE delivery first (fast, in-process)
    const delivered = sendToSSE(did, message);
    if (!delivered) {
      // Agent may be connected to another instance — publish to Redis
      await publish(`hub:direct:${did}`, message);
    }
  }

  // ── TTL-tracked offers ──────────────────────────────────────────────────────

  private trackOffer(message: HubMessage): void {
    const key = message.dealId ?? `${message.from}:${Date.now()}`;
    if (this.pendingOffers.has(key)) return;

    const expiresAt = Date.now() + OFFER_TTL_MS;
    message.ttl = expiresAt;

    const timer = setTimeout(() => {
      if (!this.pendingOffers.has(key)) return;
      this.pendingOffers.delete(key);
      console.log(`[Hub] Offer expired: ${key}`);

      const expiredMsg = (to: string) => ({
        type: "reject" as const,
        from: "hub",
        to,
        dealId: message.dealId,
        content: { reason: "offer_expired" },
      });

      if (message.to) void this.sendTo(message.to, expiredMsg(message.to));
      void this.sendTo(message.from, expiredMsg(message.from));
    }, OFFER_TTL_MS);

    this.pendingOffers.set(key, { message, expiresAt, timer });
  }

  private cancelOffer(dealId: string | undefined): void {
    if (!dealId) return;
    const offer = this.pendingOffers.get(dealId);
    if (offer) {
      clearTimeout(offer.timer);
      this.pendingOffers.delete(dealId);
    }
  }

  // ── Staking ─────────────────────────────────────────────────────────────────

  private async deductStake(did: string, amount: number): Promise<void> {
    const redis = getRedis();
    if (!redis) return;
    await redis.decrby(`stake:${did}`, amount);
  }

  getStakeBalance(did: string): Promise<number> {
    const redis = getRedis();
    if (!redis) return Promise.resolve(0);
    return redis.get(`stake:${did}`).then((v) => (v ? parseInt(v, 10) : 0));
  }

  // ── Knowledge Network ────────────────────────────────────────────────────────

  private async handleKnowledgeShare(message: HubMessage): Promise<void> {
    const payload = message.content as {
      topic: string;
      category: KnowledgeCategory;
      title: string;
      summary: string;
      data: unknown;
      confidence?: number;
      source?: string;
    };

    if (!payload?.topic || !payload?.category || !payload?.title) {
      console.warn("[Knowledge] Invalid knowledge_share from", message.from);
      return;
    }

    const entry = await saveKnowledge({
      authorDid: message.from,
      topic: payload.topic,
      category: payload.category,
      title: payload.title,
      summary: payload.summary ?? "",
      data: payload.data ?? {},
      confidence: Math.min(1, Math.max(0, payload.confidence ?? 0.8)),
      source: payload.source ?? "agent",
    });

    console.log(`[Knowledge] Saved: [${entry.category}] ${entry.topic} from ${message.from}`);

    const redis = getRedis();
    if (redis) {
      await redis.zadd("knowledge:recent", entry.timestamp, entry.id);
      await redis.zremrangebyrank("knowledge:recent", 0, -201);
      await redis.expire("knowledge:recent", 86400);
    }

    await publish("hub:broadcast", {
      type: "knowledge_update",
      from: "hub",
      content: { entry, agentCount: getSSEClientCount() },
    });
  }

  private async handleKnowledgeVote(message: HubMessage): Promise<void> {
    const payload = message.content as {
      entryId: string;
      valid: boolean;
      reason?: string;
    };
    if (!payload?.entryId) return;

    const newScore = await voteKnowledge({
      entryId: payload.entryId,
      voterDid: message.from,
      valid: payload.valid,
      reason: payload.reason,
    });
    console.log(`[Knowledge] Vote on ${payload.entryId}: ${payload.valid ? "✓" : "✗"} → score ${newScore}`);
  }

  private async handleKnowledgeRequest(message: HubMessage, requesterDid: string): Promise<void> {
    const payload = message.content as { topic?: string; category?: KnowledgeCategory };

    const entries: KnowledgeEntry[] = payload?.topic
      ? await getKnowledgeByTopic(payload.topic, 5)
      : await getRecentKnowledge(10);

    await this.sendTo(requesterDid, {
      type: "knowledge_update",
      from: "hub",
      content: { entries, topic: payload?.topic ?? "recent" },
    });
  }

  async trackKnowledgeShare(entryId: string): Promise<void> {
    await incrementShareCount(entryId);
  }

  // ── Presence broadcast ───────────────────────────────────────────────────────

  private async broadcastPresence(did: string, event: "join" | "leave"): Promise<void> {
    await publish("hub:broadcast", {
      type: "broadcast",
      from: "hub",
      content: { event, did, agentCount: this.clients.size },
    });
  }

  getOnlineAgents(): string[] {
    return [...this.clients];
  }
}

export const router = new MessageRouter();
