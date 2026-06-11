import { ethers } from "ethers";
import { EventEmitter } from "events";
import { AgentConfig, HubMessage, MessageType, KnowledgeCategory } from "./types";
import { DataClient } from "./dataClient";
import { localBus } from "./localBus";
import { log } from "./logger";
import { generateDealId } from "./negotiation";

const DEFAULT_BACKEND = "http://localhost:4001";
const DEFAULT_GW      = "http://localhost:4000";

export class HivagoraAgentSDK extends EventEmitter {
  public readonly did: string;
  public readonly displayName: string;
  public readonly data: DataClient;

  private readonly wallet: ethers.Wallet;
  private readonly config: AgentConfig;
  private useLocalBus = false;
  private token: string | null = null;
  private sseAbort: AbortController | null = null;

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

    try {
      const timestamp = Date.now();
      const message = `Login to Hivagora at ${timestamp}`;
      const signature = await this.wallet.signMessage(message);

      const resp = await fetchJson<{ token: string; did: string }>(
        `${backendUrl}/agent/register`,
        {
          method: "POST",
          body: JSON.stringify({
            address: this.wallet.address,
            signature,
            message,
            capabilities: this.config.capabilities,
          }),
          headers: { "Content-Type": "application/json" },
        }
      );
      this.token = resp.token;
      log(this.displayName, "CONNECT", `registered → ${this.did}`);
      this.startSSEStream(backendUrl);
    } catch {
      log(this.displayName, "CONNECT", `backend offline — switching to local bus`);
      this.useLocalBus = true;
      localBus.register(this.did, (msg) => this.handleIncoming(msg));
      log(this.displayName, "CONNECT", `🤖 ${this.displayName} ready on local bus (${this.did.slice(0, 30)}…)`);
    }
  }

  private startSSEStream(backendUrl: string): void {
    // Kick off SSE read loop asynchronously — not awaited so connect() returns immediately
    void this.readSSEStream(backendUrl);
  }

  private async readSSEStream(backendUrl: string): Promise<void> {
    if (this.sseAbort) this.sseAbort.abort();
    this.sseAbort = new AbortController();

    try {
      const response = await fetch(
        `${backendUrl}/hub/events?token=${this.token}`,
        { signal: this.sseAbort.signal }
      );

      if (!response.ok || !response.body) {
        throw new Error(`SSE connect failed: ${response.status}`);
      }

      log(this.displayName, "CONNECT", `SSE stream open → ${backendUrl}/hub/events`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let pendingData = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // keep incomplete last line

        for (const line of lines) {
          if (line === "" || line === "\r") {
            // Empty line → end of SSE event block: dispatch if we have data
            if (pendingData) {
              try {
                const msg = JSON.parse(pendingData) as HubMessage;
                this.handleIncoming(msg);
              } catch { /* ignore malformed */ }
              pendingData = "";
            }
          } else if (line.startsWith("data:")) {
            pendingData = line.slice(5).trim();
          }
          // Ignore "event:", "id:", ": heartbeat" comment lines
        }
      }
    } catch (err) {
      if (isAbortError(err)) return; // deliberate disconnect()

      log(this.displayName, "INFO", "SSE disconnected — reconnecting in 3 s…");
      await sleep(3000);
      if (!this.sseAbort?.signal.aborted) {
        this.readSSEStream(this.config.backendUrl ?? DEFAULT_BACKEND);
      }
    }
  }

  disconnect(): void {
    if (this.useLocalBus) {
      localBus.unregister(this.did);
    } else {
      if (this.sseAbort) {
        this.sseAbort.abort();
        this.sseAbort = null;
      }
      log(this.displayName, "DISCONNECT", "SSE stream closed");
    }
  }

  // ── Message handling ────────────────────────────────────────────────────────

  private handleIncoming(msg: HubMessage): void {
    this.emit("message", msg);
    this.emit(msg.type, msg);
  }

  // ── Send helpers ─────────────────────────────────────────────────────────────

  broadcast(content: unknown): void {
    log(this.displayName, "BROADCAST", JSON.stringify(content));
    this.send({ type: "broadcast", from: this.did, content });
  }

  negotiate(toDid: string, content: unknown, dealId?: string): string {
    const id = dealId ?? generateDealId();
    const shortTo = toDid.slice(14, 28) + "…";
    log(this.displayName, "NEGOTIATE", `→ ${shortTo}  ${JSON.stringify(content)}`);
    this.send({ type: "negotiate", from: this.did, to: toDid, content, dealId: id });
    return id;
  }

  accept(toDid: string, dealId: string, content?: unknown): void {
    log(this.displayName, "ACCEPT", `dealId=${dealId}`);
    this.send({
      type: "accept",
      from: this.did,
      to: toDid,
      dealId,
      content: content ?? { dealId },
    });
  }

  reject(toDid: string, dealId: string, reason = "declined"): void {
    log(this.displayName, "REJECT", `dealId=${dealId}  reason=${reason}`);
    this.send({ type: "reject", from: this.did, to: toDid, dealId, content: { reason } });
  }

  sendDirect(toDid: string, type: MessageType, content: unknown, dealId?: string): void {
    const shortTo = toDid.slice(14, 28) + "…";
    log(this.displayName, type.toUpperCase(), `→ ${shortTo}  ${JSON.stringify(content)}`);
    this.send({ type, from: this.did, to: toDid, content, dealId });
  }

  // ── Knowledge Network ─────────────────────────────────────────────────────────

  shareKnowledge(
    topic: string,
    category: KnowledgeCategory,
    title: string,
    summary: string,
    data: unknown,
    options: { confidence?: number; source?: string } = {}
  ): void {
    log(this.displayName, "KNOWLEDGE", `[${category}] ${topic} — ${title}`);
    this.send({
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
    });
  }

  requestKnowledge(topic?: string, category?: KnowledgeCategory): void {
    this.send({ type: "knowledge_request", from: this.did, content: { topic, category } });
  }

  voteKnowledge(entryId: string, valid: boolean, reason?: string): void {
    log(this.displayName, "VOTE", `${valid ? "✓" : "✗"} ${entryId}`);
    this.send({ type: "knowledge_vote", from: this.did, content: { entryId, valid, reason } });
  }

  // ── Core send ────────────────────────────────────────────────────────────────

  private send(msg: HubMessage): void {
    if (this.useLocalBus) {
      localBus.dispatch(msg);
      return;
    }

    const backendUrl = this.config.backendUrl ?? DEFAULT_BACKEND;
    fetch(`${backendUrl}/hub/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.token}`,
      },
      body: JSON.stringify(msg),
      signal: AbortSignal.timeout(5000),
    }).catch((err: Error) => {
      console.warn(`[${this.displayName}] Send failed:`, err.message);
    });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
