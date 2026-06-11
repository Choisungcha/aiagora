import { ethers } from "ethers";
import * as crypto from "crypto";
import AgentRegistryAbi from "../abi/AgentRegistry.json";
import DealRecordAbi from "../abi/DealRecord.json";
import ReputationScoreAbi from "../abi/ReputationScore.json";
import { HivagoraAgent } from "../types/agent";

// ── Provider & Signer ─────────────────────────────────────────────────────────

let provider: ethers.JsonRpcProvider | null = null;
let signer: ethers.Wallet | null = null;

function getProvider(): ethers.JsonRpcProvider {
  if (!provider) {
    const rpc = process.env.POLYGON_AMOY_RPC ?? "https://rpc-amoy.polygon.technology";
    provider = new ethers.JsonRpcProvider(rpc);
  }
  return provider;
}

function getSigner(): ethers.Wallet {
  if (!signer) {
    const pk = process.env.BRIDGE_PRIVATE_KEY;
    if (!pk) throw new Error("BRIDGE_PRIVATE_KEY not set");
    signer = new ethers.Wallet(pk, getProvider());
  }
  return signer;
}

// ── Contract instances ────────────────────────────────────────────────────────

function registryContract(withSigner = false) {
  const addr = process.env.AGENT_REGISTRY_ADDRESS;
  if (!addr) throw new Error("AGENT_REGISTRY_ADDRESS not set");
  const runner = withSigner ? getSigner() : getProvider();
  return new ethers.Contract(addr, AgentRegistryAbi.abi, runner);
}

function dealRecordContract(withSigner = false) {
  const addr = process.env.DEAL_RECORD_ADDRESS;
  if (!addr) throw new Error("DEAL_RECORD_ADDRESS not set");
  const runner = withSigner ? getSigner() : getProvider();
  return new ethers.Contract(addr, DealRecordAbi.abi, runner);
}

function reputationContract(withSigner = false) {
  const addr = process.env.REPUTATION_ADDRESS;
  if (!addr) throw new Error("REPUTATION_ADDRESS not set");
  const runner = withSigner ? getSigner() : getProvider();
  return new ethers.Contract(addr, ReputationScoreAbi.abi, runner);
}

// ── Agent Registry ────────────────────────────────────────────────────────────

export async function isAgentActiveOnChain(did: string): Promise<boolean> {
  try {
    return await registryContract().isAgentActive(did);
  } catch {
    return false;
  }
}

export async function getAgentFromChain(did: string): Promise<HivagoraAgent | null> {
  try {
    const result = await registryContract().getAgent(did);
    return {
      did: result.did as string,
      capabilities: result.capabilities as string[],
      reputation: 0, // filled from ReputationScore below
      stake: (result.stake as bigint).toString(),
      endpoint: result.endpoint as string,
      owner: result.owner as string,
      isActive: result.isActive as boolean,
    };
  } catch {
    return null;
  }
}

// ── Deal Bridge ───────────────────────────────────────────────────────────────

export function computeDealHash(
  dealId: string,
  agentA: string,
  agentB: string,
  content: unknown
): string {
  const raw = JSON.stringify({ dealId, agentA, agentB, content });
  return "0x" + crypto.createHash("sha256").update(raw).digest("hex");
}

export interface RecordDealResult {
  txHash: string;
  dealHash: string;
  blockNumber: number;
}

export async function recordDealOnChain(
  dealId: string,
  agentA: string,
  agentB: string,
  content: unknown
): Promise<RecordDealResult> {
  const dealHash = computeDealHash(dealId, agentA, agentB, content);
  const contract = dealRecordContract(true);
  const tx = await contract.recordDeal(dealId, agentA, agentB, dealHash);
  const receipt = await tx.wait();
  return {
    txHash: receipt.hash,
    dealHash,
    blockNumber: receipt.blockNumber,
  };
}

export async function getDealFromChain(dealId: string) {
  try {
    const deal = await dealRecordContract().getDeal(dealId);
    return {
      dealId: deal.dealId as string,
      agentA: deal.agentA as string,
      agentB: deal.agentB as string,
      dealHash: deal.dealHash as string,
      timestamp: Number(deal.timestamp as bigint),
    };
  } catch {
    return null;
  }
}

// ── Reputation ────────────────────────────────────────────────────────────────

export async function getReputationScore(did: string): Promise<number> {
  try {
    const score = await reputationContract().getScore(did);
    return Number(score as bigint);
  } catch {
    return 0;
  }
}
