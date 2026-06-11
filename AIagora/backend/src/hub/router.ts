import { WebSocket } from "ws";
import { HubMessage, PendingOffer, KnowledgeEntry, KnowledgeCategory } from "../types/agent";
import { isBlacklisted } from "../blacklist/guard";
import { getRedis } from "../db/redis";
import {
  saveKnowledge,
  getKnowledgeByTopic,
  getRecentKnowledge,
  voteKnowledge,
  incrementShareCount,
} from "../knowledge/store";

const OFFER_TTL_MS = 30_000; // 30 seconds
const BROADCAST_STAKE_COST = 1; // stake units deducted per broadcast

export class MessageRouter {
  // did → WebSocket
  public readonly clients = new Map<string, WebSocket>();
  // dealId → PendingOffer (TTL-tracked negotiate/propose messages)
  private readonly pendingOffers = new Map<string, PendingOffer>();

  registerClient(did: string, ws: WebSocket): void {
    this.clients.set(did, ws);
    console.log(`[Hub] Connected: ${did} (${this.clients.size} total)`);
    this.broadcastPresence(did, "join");
  }

  removeClient(did: string): void {
    this.clients.delete(did);
    console.log(`[Hub] Disconnected: ${did} (${this.clients.size} total)`);
    this.broadcastPresence(did, "leave");
  }

  async handleMessage(raw: string, senderDid: string): Promise<void> {
    let message: HubMessage;
    try {
      message = JSON.parse(raw) as HubMessage;
    } catch {
      console.warn("[Hub] Malformed message from", senderDid);
      return;
    }

    // Server overrides `from` — client cannot spoof sender identity
    message.from = senderDid;

    // Blacklist check on every message
    if (await isBlacklisted(senderDid)) {
      const ws = this.clients.get(senderDid);
      if (ws) ws.close(4403, "Blacklisted");
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
        this.sendDirect(message);
        break;
      case "accept":
        this.cancelOffer(message.dealId);
        this.sendDirect(message);
        break;
      case "reject":
        this.cancelOffer(message.dealId);
        this.sendDirect(message);
        break;
      case "direct":
      case "join_bundle":
        this.sendDirect(message);
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
        this.sendTo(senderDid, { type: "pong", from: "hub", content: {} });
        break;
      default:
        console.warn("[Hub] Unknown message type:", (message as HubMessage).type);
    }
  }

  private async handleBroadcast(message: HubMessage): Promise<void> {
    // Deduct staking cost from Redis counter (non-blocking)
    await this.deductStake(message.from, BROADCAST_STAKE_COST);
    this.broadcast(message);
  }

  private broadcast(message: HubMessage): void {
    const payload = JSON.stringify(message);
    let delivered = 0;
    this.clients.forEach((ws, did) => {
      if (did !== message.from && ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
        delivered++;
      }
    });
    console.log(`[Hub] Broadcast from ${message.from} → ${delivered} agents`);
  }

  private sendDirect(message: HubMessage): void {
    if (!message.to) {
      console.warn("[Hub] direct/negotiate without `to` field from", message.from);
      return;
    }
    this.sendTo(message.to, message);
  }

  sendTo(did: string, message: Partial<HubMessage>): void {
    const ws = this.clients.get(did);
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    } else {
      console.warn(`[Hub] Target ${did} unavailable`);
    }
  }

  // ── TTL-tracked offers ──────────────────────────────────────────────────────

  private trackOffer(message: HubMessage): void {
    const key = message.dealId ?? `${message.from}:${Date.now()}`;
    if (this.pendingOffers.has(key)) return; // already tracked

    const expiresAt = Date.now() + OFFER_TTL_MS;
    message.ttl = expiresAt;

    const timer = setTimeout(() => {
      if (this.pendingOffers.has(key)) {
        this.pendingOffers.delete(key);
        console.log(`[Hub] Offer expired: ${key}`);
        // Notify both parties that the offer has expired
        if (message.to) {
          this.sendTo(message.to, {
            type: "reject",
            from: "hub",
            to: message.to,
            dealId: message.dealId,
            content: { reason: "offer_expired" },
          });
        }
        this.sendTo(message.from, {
          type: "reject",
          from: "hub",
          to: message.from,
          dealId: message.dealId,
          content: { reason: "offer_expired" },
        });
      }
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
    const key = `stake:${did}`;
    // Decrement; if key doesn't exist, Redis sets to -amount (creates with 0 base)
    await redis.decrby(key, amount);
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

    // Global recent index update in Redis
    const redis = getRedis();
    if (redis) {
      await redis.zadd("knowledge:recent", entry.timestamp, entry.id);
      await redis.zremrangebyrank("knowledge:recent", 0, -201);
      await redis.expire("knowledge:recent", 86400);
    }

    // Broadcast knowledge_update to all connected agents
    const updateMsg = JSON.stringify({
      type: "knowledge_update",
      from: "hub",
      content: { entry, agentCount: this.clients.size },
    });
    this.clients.forEach((ws, did) => {
      if (did !== message.from && ws.readyState === WebSocket.OPEN) {
        ws.send(updateMsg);
      }
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

    // Notify the original author
    console.log(`[Knowledge] Vote on ${payload.entryId}: ${payload.valid ? "✓" : "✗"} → score ${newScore}`);
  }

  private async handleKnowledgeRequest(message: HubMessage, requesterDid: string): Promise<void> {
    const payload = message.content as { topic?: string; category?: KnowledgeCategory };

    let entries: KnowledgeEntry[];
    if (payload?.topic) {
      entries = await getKnowledgeByTopic(payload.topic, 5);
    } else {
      entries = await getRecentKnowledge(10);
    }

    this.sendTo(requesterDid, {
      type: "knowledge_update",
      from: "hub",
      content: { entries, topic: payload?.topic ?? "recent" },
    });
  }

  // 외부에서 지식 공유 횟수 증가 (REST API 경유 재공유 시 사용)
  async trackKnowledgeShare(entryId: string): Promise<void> {
    await incrementShareCount(entryId);
  }

  // ── Presence broadcast ───────────────────────────────────────────────────────

  private broadcastPresence(did: string, event: "join" | "leave"): void {
    const payload = JSON.stringify({
      type: "broadcast",
      from: "hub",
      content: { event, did, agentCount: this.clients.size },
    });
    this.clients.forEach((ws, clientDid) => {
      if (clientDid !== did && ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    });
  }

  getOnlineAgents(): string[] {
    return Array.from(this.clients.keys());
  }
}

export const router = new MessageRouter();
