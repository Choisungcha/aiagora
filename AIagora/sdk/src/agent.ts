import { ethers } from "ethers";
import WebSocket from "ws";
import { EventEmitter } from "events";
import { AgentConfig, HubMessage, MessageType, KnowledgeCategory } from "./types";
import { DataClient } from "./dataClient";
import { localBus } from "./localBus";
import { log } from "./logger";
import { generateDealId } from "./negotiation";

const DEFAULT_HUB    = "ws://localhost:4001/hivagora/hub";
const DEFAULT_GW     = "http://localhost:4000";
const DEFAULT_BACKEND = "http://localhost:4001";

export class HivagoraAgentSDK extends EventEmitter {
  public readonly did: string;
  public readonly displayName: string;
  public readonly data: DataClient;

  private readonly wallet: ethers.Wallet;
  private readonly config: AgentConfig;
  private ws: WebSocket | null = null;
  private useLocalBus = false;
  private token: string | null = null;

  constructor(config: AgentConfig) {
    super();
    this.config = config;
    this.wallet = new ethers.Wallet(config.privateKey);
    this.did = `did:hivagora:${this.wallet.address.toLowerCase()}`;
    this.displayName = config.name;
    this.data = new DataClient(config.gatewayUrl ?? DEFAULT_GW, config.name);
  }

  // ── Connection ──────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    const backendUrl = this.config.backendUrl ?? DEFAULT_BACKEND;
    const hubUrl = this.config.hubUrl ?? DEFAULT_HUB;

    // Try to get JWT from backend; fall back to local bus on failure
    try {
      const timestamp = Date.now();
      const message = `Login to Hivagora at ${timestamp}`;
      const signature = await this.wallet.signMessage(message);

      const resp = await fetchJson<{ token: string; did: string }>(
        `${backendUrl}/agent/register`,
        {
          method: "POST",
          body: JSON.stringify({ address: this.wallet.address, signature, message, capabilities: this.config.capabilities }),
          headers: { "Content-Type": "application/json" },
        }
      );
      this.token = resp.token;
      log(this.displayName, "CONNECT", `registered → ${this.did}`);
      await this.connectWs(hubUrl);
    } catch {
      log(this.displayName, "CONNECT", `backend offline — switching to local bus`);
      this.useLocalBus = true;
      localBus.register(this.did, (msg) => this.handleIncoming(msg));
      log(this.displayName, "CONNECT", `🤖 ${this.displayName} ready on local bus  (${this.did.slice(0, 30)}…)`);
    }
  }

  private connectWs(hubUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${hubUrl}?token=${this.token}`);
      this.ws = ws;

      ws.on("open", () => {
        log(this.displayName, "CONNECT", `WebSocket open → ${hubUrl}`);
        resolve();
      });

      ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString()) as HubMessage;
          this.handleIncoming(msg);
        } catch {
          // ignore parse errors
        }
      });

      ws.on("error", (err) => reject(err));
      ws.on("close", () => {
        log(this.displayName, "INFO", "WebSocket closed");
      });
    });
  }

  disconnect(): void {
    if (this.useLocalBus) localBus.unregister(this.did);
    if (this.ws) this.ws.close();
  }

  // ── Message handling ────────────────────────────────────────────────────────

  private handleIncoming(msg: HubMessage): void {
    this.emit("message", msg);
    this.emit(msg.type, msg);
  }

  // ── Send helpers ─────────────────────────────────────────────────────────────

  broadcast(content: unknown): void {
    const msg: HubMessage = {
      type: "broadcast",
      from: this.did,
      content,
    };
    log(this.displayName, "BROADCAST", JSON.stringify(content));
    this.send(msg);
  }

  negotiate(toDid: string, content: unknown, dealId?: string): string {
    const id = dealId ?? generateDealId();
    const msg: HubMessage = {
      type: "negotiate",
      from: this.did,
      to: toDid,
      content,
      dealId: id,
    };
    const shortTo = toDid.slice(14, 28) + "…";
    log(this.displayName, "NEGOTIATE", `→ ${shortTo}  ${JSON.stringify(content)}`);
    this.send(msg);
    return id;
  }

  accept(toDid: string, dealId: string, content?: unknown): void {
    const msg: HubMessage = {
      type: "accept",
      from: this.did,
      to: toDid,
      dealId,
      content: content ?? { dealId },
    };
    log(this.displayName, "ACCEPT", `dealId=${dealId}`);
    this.send(msg);
  }

  reject(toDid: string, dealId: string, reason = "declined"): void {
    const msg: HubMessage = {
      type: "reject",
      from: this.did,
      to: toDid,
      dealId,
      content: { reason },
    };
    log(this.displayName, "REJECT", `dealId=${dealId}  reason=${reason}`);
    this.send(msg);
  }

  sendDirect(toDid: string, type: MessageType, content: unknown, dealId?: string): void {
    const msg: HubMessage = { type, from: this.did, to: toDid, content, dealId };
    const shortTo = toDid.slice(14, 28) + "…";
    log(this.displayName, type.toUpperCase(), `→ ${shortTo}  ${JSON.stringify(content)}`);
    this.send(msg);
  }

  // ── Knowledge Network helpers ─────────────────────────────────────────────────

  shareKnowledge(
    topic: string,
    category: KnowledgeCategory,
    title: string,
    summary: string,
    data: unknown,
    options: { confidence?: number; source?: string } = {}
  ): void {
    const msg: HubMessage = {
      type: "knowledge_share",
      from: this.did,
      content: {
        topic,
        category,
        title,
        summary,
        data,
        confidence: options.confidence ?? 0.85,
        source: options.source ?? this.displayName,
      },
    };
    log(this.displayName, "KNOWLEDGE", `[${category}] ${topic} — ${title}`);
    this.send(msg);
  }

  requestKnowledge(topic?: string, category?: KnowledgeCategory): void {
    const msg: HubMessage = {
      type: "knowledge_request",
      from: this.did,
      content: { topic, category },
    };
    this.send(msg);
  }

  voteKnowledge(entryId: string, valid: boolean, reason?: string): void {
    const msg: HubMessage = {
      type: "knowledge_vote",
      from: this.did,
      content: { entryId, valid, reason },
    };
    log(this.displayName, "VOTE", `${valid ? "✓" : "✗"} ${entryId}`);
    this.send(msg);
  }

  private send(msg: HubMessage): void {
    if (this.useLocalBus) {
      localBus.dispatch(msg);
      return;
    }
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }
}

// ── Tiny fetch wrapper ────────────────────────────────────────────────────────

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}
