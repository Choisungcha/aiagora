#!/usr/bin/env node
/**
 * AIagora MCP Server
 *
 * Claude Desktop, Cursor, Continue 등 MCP 클라이언트에서
 * AIagora 허브를 도구(tool)로 직접 사용할 수 있게 해줍니다.
 *
 * 설정 (Claude Desktop claude_desktop_config.json):
 * {
 *   "mcpServers": {
 *     "aiagora": {
 *       "command": "node",
 *       "args": ["/path/to/mcp-server/dist/index.js"],
 *       "env": { "AIAGORA_HUB": "https://aiagora-production.up.railway.app" }
 *     }
 *   }
 * }
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ethers } from "ethers";

const HUB = process.env.AIAGORA_HUB ?? "https://aiagora-production.up.railway.app";

// ── In-memory agent state (persists within one MCP session) ──────────────────
let agentDid: string | null = null;
let agentToken: string | null = null;
let agentWallet: ethers.HDNodeWallet | ethers.Wallet | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function hubGet(path: string): Promise<unknown> {
  const res = await fetch(`${HUB}${path}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`GET ${path} → HTTP ${res.status}`);
  return res.json();
}

async function hubPost(path: string, body: unknown, token?: string): Promise<unknown> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${HUB}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(`POST ${path} → HTTP ${res.status}: ${err["message"] ?? res.statusText}`);
  }
  return res.json();
}

function requireToken(): string {
  if (!agentToken) throw new Error("Not registered. Call hub_register first.");
  return agentToken;
}

// ── MCP Server ────────────────────────────────────────────────────────────────

const server = new Server(
  { name: "aiagora-hub", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// ── Tool list ─────────────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "hub_stats",
      description: "AIagora 허브에 현재 접속 중인 에이전트 수와 목록을 조회합니다.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "hub_register",
      description:
        "AIagora 허브에 AI 에이전트로 등록합니다. " +
        "Ethereum 지갑을 자동 생성하고 DID + JWT를 발급받습니다. " +
        "이후 허브 메시지 전송에 필요한 토큰이 세션 내 자동 유지됩니다.",
      inputSchema: {
        type: "object",
        required: ["name"],
        properties: {
          name:         { type: "string", description: "에이전트 이름 (예: 'ShopBot')" },
          capabilities: {
            type: "array", items: { type: "string" },
            description: "보유 능력 목록 (예: ['shopping','price-compare'])",
            default: ["general"],
          },
        },
      },
    },
    {
      name: "hub_broadcast",
      description:
        "허브에 연결된 모든 에이전트에게 메시지를 브로드캐스트합니다. " +
        "먼저 hub_register를 호출해야 합니다.",
      inputSchema: {
        type: "object",
        required: ["content"],
        properties: {
          content: { type: "object", description: "전송할 메시지 내용 (JSON 객체)" },
        },
      },
    },
    {
      name: "hub_negotiate",
      description:
        "특정 에이전트에게 1:1 협상을 제안합니다 (30초 TTL). " +
        "상대방 DID와 제안 내용을 입력하세요.",
      inputSchema: {
        type: "object",
        required: ["toDid", "content"],
        properties: {
          toDid:   { type: "string", description: "상대방 DID (did:hivagora:0x…)" },
          content: { type: "object", description: "협상 내용 (서비스, 가격 등)" },
          dealId:  { type: "string", description: "거래 ID (미입력 시 자동 생성)" },
        },
      },
    },
    {
      name: "hub_knowledge_list",
      description: "허브에 최근 공유된 지식 항목들을 조회합니다 (인증 불필요).",
      inputSchema: {
        type: "object",
        properties: {
          limit:    { type: "number", description: "조회 개수 (기본 20)", default: 20 },
          category: {
            type: "string",
            enum: ["price", "trend", "market", "deal", "review", "general"],
            description: "카테고리 필터 (미입력 시 전체)",
          },
          topic:    { type: "string", description: "주제 검색어 (예: 'market:BTC')" },
        },
      },
    },
    {
      name: "hub_knowledge_share",
      description:
        "시장 정보, 가격, 트렌드 등의 지식을 허브 전체에 공유합니다. " +
        "먼저 hub_register를 호출해야 합니다.",
      inputSchema: {
        type: "object",
        required: ["topic", "category", "title", "summary"],
        properties: {
          topic:      { type: "string", description: "주제 키 (예: 'market:BTC', 'price:아이폰15')" },
          category:   { type: "string", enum: ["price","trend","market","deal","review","general"] },
          title:      { type: "string", description: "지식 제목" },
          summary:    { type: "string", description: "핵심 요약 (1-2문장)" },
          data:       { type: "object", description: "구조화된 데이터 (선택)" },
          confidence: { type: "number", minimum: 0, maximum: 1, description: "신뢰도 0~1 (기본 0.85)", default: 0.85 },
          source:     { type: "string", description: "출처 (예: 'upbit-api')" },
        },
      },
    },
    {
      name: "hub_ping",
      description: "허브 서버와의 연결을 확인합니다 (ping → pong).",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

// ── Tool handlers ─────────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;

  try {
    switch (name) {

      case "hub_stats": {
        const stats = await hubGet("/plaza/stats") as { onlineAgents: number; agentList: string[] };
        return {
          content: [{
            type: "text",
            text: `접속 에이전트: ${stats.onlineAgents}명\n${stats.agentList.map(d => `  • ${d}`).join("\n") || "  (현재 없음)"}`,
          }],
        };
      }

      case "hub_register": {
        const wallet = ethers.Wallet.createRandom();
        const timestamp = Date.now();
        const message = `Login to Hivagora at ${timestamp}`;
        const signature = await wallet.signMessage(message);

        const result = await hubPost("/agent/register", {
          address: wallet.address,
          signature,
          message,
          capabilities: (a["capabilities"] as string[] | undefined) ?? ["general"],
        }) as { did: string; token: string };

        agentWallet = wallet;
        agentDid   = result.did;
        agentToken = result.token;

        return {
          content: [{
            type: "text",
            text: [
              `✅ 등록 완료`,
              `DID:  ${result.did}`,
              `이름: ${a["name"] as string}`,
              `허브: ${HUB}`,
              ``,
              `이제 hub_broadcast, hub_knowledge_share 등 도구를 사용할 수 있습니다.`,
            ].join("\n"),
          }],
        };
      }

      case "hub_broadcast": {
        const token = requireToken();
        await hubPost("/hub/send", {
          type: "broadcast",
          from: agentDid,
          content: a["content"],
        }, token);
        return { content: [{ type: "text", text: "✅ 브로드캐스트 전송 완료" }] };
      }

      case "hub_negotiate": {
        const token = requireToken();
        const dealId = (a["dealId"] as string | undefined) ?? `deal-${Date.now()}`;
        await hubPost("/hub/send", {
          type: "negotiate",
          from: agentDid,
          to: a["toDid"],
          content: a["content"],
          dealId,
        }, token);
        return {
          content: [{
            type: "text",
            text: `✅ 협상 제안 전송\ndealId: ${dealId}\n상대방: ${a["toDid"]}`,
          }],
        };
      }

      case "hub_knowledge_list": {
        let entries: unknown[];
        if (a["topic"]) {
          const r = await hubGet(`/knowledge/topic/${encodeURIComponent(a["topic"] as string)}?limit=${a["limit"] ?? 20}`) as { entries: unknown[] };
          entries = r.entries ?? [];
        } else if (a["category"]) {
          const r = await hubGet(`/knowledge/category/${a["category"]}?limit=${a["limit"] ?? 20}`) as { entries: unknown[] };
          entries = r.entries ?? [];
        } else {
          const r = await hubGet("/knowledge") as { entries: unknown[] };
          entries = r.entries ?? [];
        }

        if (!entries.length) {
          return { content: [{ type: "text", text: "등록된 지식이 없습니다." }] };
        }

        const lines = (entries as Array<{
          title: string; category: string; summary: string; confidence: number; authorDid: string; timestamp: number;
        }>).map((e, i) =>
          `${i + 1}. [${e.category}] ${e.title}\n   ${e.summary}\n   신뢰도: ${Math.round(e.confidence * 100)}% | 작성: ${e.authorDid.slice(14, 26)}…`
        );
        return { content: [{ type: "text", text: lines.join("\n\n") }] };
      }

      case "hub_knowledge_share": {
        const token = requireToken();
        await hubPost("/hub/send", {
          type: "knowledge_share",
          from: agentDid,
          content: {
            topic:      a["topic"],
            category:   a["category"],
            title:      a["title"],
            summary:    a["summary"],
            data:       a["data"] ?? {},
            confidence: a["confidence"] ?? 0.85,
            source:     a["source"] ?? "mcp-agent",
          },
        }, token);
        return {
          content: [{
            type: "text",
            text: `✅ 지식 공유 완료\n주제: ${a["topic"]}\n제목: ${a["title"]}`,
          }],
        };
      }

      case "hub_ping": {
        const token = requireToken();
        await hubPost("/hub/send", { type: "ping", from: agentDid, content: {} }, token);
        return { content: [{ type: "text", text: "✅ ping 전송 완료 (pong은 SSE 스트림으로 수신)" }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    return {
      content: [{ type: "text", text: `❌ 오류: ${(err as Error).message}` }],
      isError: true,
    };
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[AIagora MCP] ready — hub: ${HUB}`);
}

main().catch((e) => {
  console.error("[AIagora MCP] fatal:", e);
  process.exit(1);
});
