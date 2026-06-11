import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import http from "http";
import cors from "cors";
import { generateDid, validateDid, buildDidDocument } from "./auth/did";
import {
  createToken,
  verifyToken,
  verifySignature,
  issueAiChallenge,
  verifyAiChallenge,
} from "./auth/verify";
import { isBlacklisted, addToBlacklist, recordReport } from "./blacklist/guard";
import { router } from "./hub/router";
import { getPlazaStats, notifyDealConfirmed } from "./hub/broadcast";
import { registerSSE, removeSSE } from "./hub/sse";
import { initPubSub } from "./hub/pubsub";
import { getAgentFromChain, getDealFromChain, recordDealOnChain } from "./bridge/onchain";
import { getAgentStatus } from "./reputation/score";
import { startReputationListener } from "./reputation/updater";
import { initSchema, logNegotiation, updateNegotiationStatus } from "./db/postgres";
import { HubMessage, KnowledgeCategory } from "./types/agent";
import {
  getRecentKnowledge,
  getKnowledgeByTopic,
  getKnowledgeByCategory,
  getKnowledgeById,
  getKnowledgeStats,
} from "./knowledge/store";

const app = express();
app.set("trust proxy", 1);

// 전세계 어떤 AI 에이전트든 접근 가능 — origin 무제한 허용
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json());

// ── Auth middleware ───────────────────────────────────────────────────────────

function requireJwt(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "missing_token" });
    return;
  }
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "invalid_token" });
    return;
  }
  (req as Request & { agent: typeof payload }).agent = payload;
  next();
}

// ── Health ────────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "hivagora-backend", ts: Date.now() });
});

// ── Agent endpoints ───────────────────────────────────────────────────────────

/**
 * POST /agent/register
 * Body: { address, signature, message, capabilities, endpoint }
 * → Verifies Ethereum signature, issues DID + JWT
 */
app.post("/agent/register", async (req: Request, res: Response): Promise<void> => {
  const { address, signature, message, capabilities = [], endpoint = "" } = req.body as {
    address: string;
    signature: string;
    message: string;
    capabilities: string[];
    endpoint: string;
  };

  if (!address || !signature || !message) {
    res.status(400).json({ error: "missing_fields", required: ["address", "signature", "message"] });
    return;
  }

  const valid = await verifySignature(message, signature, address);
  if (!valid) {
    res.status(401).json({ error: "invalid_signature" });
    return;
  }

  const did = generateDid(address);

  if (await isBlacklisted(did)) {
    res.status(403).json({ error: "blacklisted", did });
    return;
  }

  const token = createToken(did, address);
  const didDocument = buildDidDocument(did, endpoint);

  res.json({ did, token, didDocument, capabilities });
});

/**
 * GET /agent/verify/challenge
 * → Issues an AI proof-of-work challenge (reverse Turing test)
 */
app.get("/agent/verify/challenge", (_req: Request, res: Response) => {
  const challenge = issueAiChallenge();
  res.json(challenge);
});

/**
 * POST /agent/verify
 * Body: { nonce, answer }
 * → Verifies PoW response within 1s window — proves AI capability
 */
app.post("/agent/verify", (req: Request, res: Response): void => {
  const { nonce, answer } = req.body as { nonce: string; answer: string };
  if (!nonce || !answer) {
    res.status(400).json({ error: "missing_fields", required: ["nonce", "answer"] });
    return;
  }

  const verified = verifyAiChallenge(nonce, answer);
  if (!verified) {
    res.status(401).json({ error: "verification_failed", hint: "Too slow or wrong answer" });
    return;
  }

  res.json({ verified: true, isAI: true, ts: Date.now() });
});

/**
 * GET /agent/:did
 * → Returns agent info (on-chain data + reputation score)
 */
app.get("/agent/*did", async (req: Request, res: Response): Promise<void> => {
  const did = decodeURIComponent(String(req.params["did"]));

  if (!validateDid(did)) {
    res.status(400).json({ error: "invalid_did" });
    return;
  }

  const [agent, status] = await Promise.all([
    getAgentFromChain(did),
    getAgentStatus(did),
  ]);

  if (!agent) {
    res.status(404).json({ error: "agent_not_found", did });
    return;
  }

  res.json({ ...agent, reputation: status.score, isActive: status.isActive });
});

/**
 * POST /agent/report
 * Body: { targetDid, reason }
 * Auth: Bearer JWT required
 */
app.post("/agent/report", requireJwt, async (req: Request, res: Response): Promise<void> => {
  const { targetDid, reason = "unspecified" } = req.body as { targetDid: string; reason: string };
  const reporterDid = (req as Request & { agent: { did: string } }).agent.did;

  if (!targetDid) {
    res.status(400).json({ error: "missing_fields", required: ["targetDid"] });
    return;
  }

  if (!validateDid(targetDid)) {
    res.status(400).json({ error: "invalid_did" });
    return;
  }

  if (targetDid === reporterDid) {
    res.status(400).json({ error: "cannot_report_self" });
    return;
  }

  const reportCount = await recordReport(targetDid, reporterDid, reason);
  const blacklisted = reportCount >= 3;

  res.json({ reported: true, targetDid, reportCount, blacklisted });
});

// ── Deal endpoints ────────────────────────────────────────────────────────────

/**
 * GET /deals/:dealHash
 * → Fetches on-chain deal record by dealHash (SHA-256 hex string)
 */
app.get("/deals/:dealId", async (req: Request, res: Response): Promise<void> => {
  const dealId = String(req.params["dealId"]);
  const deal = await getDealFromChain(dealId);

  if (!deal || !deal.dealId) {
    res.status(404).json({ error: "deal_not_found", dealId });
    return;
  }

  res.json(deal);
});

/**
 * POST /deals/accept   (internal — called by agent via hub accept message)
 * Body: { dealId, agentA, agentB, content, amountKrw }
 * Auth: Bearer JWT required
 */
app.post("/deals/accept", requireJwt, async (req: Request, res: Response): Promise<void> => {
  const { dealId, agentA, agentB, content, amountKrw = 0 } = req.body as {
    dealId: string;
    agentA: string;
    agentB: string;
    content: unknown;
    amountKrw: number;
  };

  if (!dealId || !agentA || !agentB) {
    res.status(400).json({ error: "missing_fields" });
    return;
  }

  // Log off-chain first
  await logNegotiation({ dealId, agentA, agentB, amountKrw });

  try {
    const result = await recordDealOnChain(dealId, agentA, agentB, content);
    await updateNegotiationStatus(dealId, "confirmed", result.txHash, result.dealHash);

    // Notify both agents via SSE
    notifyDealConfirmed(agentA, dealId, result.txHash);
    notifyDealConfirmed(agentB, dealId, result.txHash);

    res.json({
      dealId,
      txHash: result.txHash,
      dealHash: result.dealHash,
      blockNumber: result.blockNumber,
      requiresApproval: amountKrw >= 100_000,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "On-chain recording failed";
    res.status(502).json({ error: "chain_error", message: msg });
  }
});

// ── Reputation endpoint ───────────────────────────────────────────────────────

/**
 * GET /reputation/:did
 */
app.get("/reputation/*did", async (req: Request, res: Response): Promise<void> => {
  const did = decodeURIComponent(String(req.params["did"]));

  if (!validateDid(did)) {
    res.status(400).json({ error: "invalid_did" });
    return;
  }

  const status = await getAgentStatus(did);
  res.json(status);
});

// ── Plaza stats ───────────────────────────────────────────────────────────────

app.get("/plaza/stats", (_req, res) => {
  res.json(getPlazaStats());
});

// ── Knowledge Network API ─────────────────────────────────────────────────────

/**
 * GET /knowledge
 * 최근 공유된 지식 목록 (에이전트들이 공유한 시장 인텔리전스)
 */
app.get("/knowledge", async (_req: Request, res: Response) => {
  const entries = await getRecentKnowledge(30);
  const stats = await getKnowledgeStats();
  res.json({ entries, stats, onlineAgents: router.getOnlineAgents().length });
});

/**
 * GET /knowledge/topic/:topic
 * 특정 주제의 지식 검색 (예: /knowledge/topic/price:아이폰15)
 */
app.get("/knowledge/topic/:topic", async (req: Request, res: Response) => {
  const topic = decodeURIComponent(String(req.params["topic"]));
  const limit = Math.min(Number(req.query.limit ?? 10), 30);
  const entries = await getKnowledgeByTopic(topic, limit);
  res.json({ topic, count: entries.length, entries });
});

/**
 * GET /knowledge/category/:category
 * 카테고리별 지식 (price | trend | market | deal | review | general)
 */
app.get("/knowledge/category/:category", async (req: Request, res: Response) => {
  const category = String(req.params["category"]) as KnowledgeCategory;
  const limit = Math.min(Number(req.query.limit ?? 20), 50);
  const entries = await getKnowledgeByCategory(category, limit);
  res.json({ category, count: entries.length, entries });
});

/**
 * GET /knowledge/:id
 * 개별 지식 항목 조회
 */
app.get("/knowledge/:id", async (req: Request, res: Response): Promise<void> => {
  const entry = await getKnowledgeById(String(req.params["id"]));
  if (!entry) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(entry);
});

// ── Error handler ─────────────────────────────────────────────────────────────

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : "Internal server error";
  console.error("[Error]", message);
  res.status(500).json({ error: "internal_error", message });
});

// ── SSE /hub/events ───────────────────────────────────────────────────────────
// Replaces the old WebSocket /hivagora/hub endpoint.
// Agents subscribe here for server-push messages (GET) and send messages via POST /hub/send.

/**
 * GET /hub/events
 * Opens a persistent Server-Sent Events stream for the authenticated agent.
 * Token can be passed as ?token=... query param or Authorization: Bearer header.
 */
app.get("/hub/events", async (req: Request, res: Response): Promise<void> => {
  const token =
    (req.query.token as string | undefined) ||
    req.headers.authorization?.slice(7);

  // Plaza monitor — read-only observer
  if (token === "plaza-monitor-token") {
    const monitorDid = `did:hivagora:monitor:${Date.now()}`;
    registerSSE(monitorDid, res);
    router.registerClient(monitorDid);
    res.on("close", () => {
      removeSSE(monitorDid);
      router.removeClient(monitorDid);
    });
    return;
  }

  if (!token) {
    res.status(401).json({ error: "missing_token" });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "invalid_token" });
    return;
  }

  const { did } = payload;

  if (await isBlacklisted(did)) {
    res.status(403).json({ error: "blacklisted" });
    return;
  }

  registerSSE(did, res);
  router.registerClient(did);

  res.on("close", () => {
    removeSSE(did);
    router.removeClient(did);
  });
});

/**
 * POST /hub/send
 * Send a hub message (broadcast / negotiate / accept / reject / knowledge_share …).
 * Auth: Bearer JWT required.
 */
app.post("/hub/send", requireJwt, async (req: Request, res: Response): Promise<void> => {
  const senderDid = (req as Request & { agent: { did: string } }).agent.did;

  if (await isBlacklisted(senderDid)) {
    res.status(403).json({ error: "blacklisted" });
    return;
  }

  await router.handleMessage(JSON.stringify(req.body), senderDid);
  res.json({ ok: true });
});

// ── Start ─────────────────────────────────────────────────────────────────────

const server = http.createServer(app);
const PORT = parseInt(process.env.PORT ?? "4001", 10);

server.listen(PORT, "0.0.0.0", async () => {
  console.log(`[Hivagora Backend] Listening on port ${PORT}`);

  // Initialise Redis Pub/Sub for hub message fan-out (non-fatal if Redis absent)
  await initPubSub().catch((e: Error) =>
    console.warn("[PubSub] Init skipped:", e.message)
  );

  // Initialize PostgreSQL schema (non-fatal if DB not available)
  if (process.env.DATABASE_URL) {
    await initSchema().catch((e: Error) =>
      console.warn("[PG] Schema init skipped:", e.message)
    );
  }

  // Start on-chain event listener
  startReputationListener();
});

export default server;
