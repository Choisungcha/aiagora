import { ethers } from "ethers";
import ReputationScoreAbi from "../abi/ReputationScore.json";
import AgentRegistryAbi from "../abi/AgentRegistry.json";
import { invalidateScoreCache } from "./score";
import { addToBlacklist } from "../blacklist/guard";

let started = false;

export function startReputationListener(): void {
  if (started) return;

  const repAddr = process.env.REPUTATION_ADDRESS;
  const regAddr = process.env.AGENT_REGISTRY_ADDRESS;
  if (!repAddr || !regAddr) {
    console.warn("[Reputation] Contract addresses not set — listener skipped");
    return;
  }

  const rpc = process.env.POLYGON_AMOY_RPC ?? "https://rpc-amoy.polygon.technology";
  // Use WebSocket provider for event streaming if available
  const wsRpc = process.env.POLYGON_AMOY_WS_RPC;
  const provider = wsRpc
    ? new ethers.WebSocketProvider(wsRpc)
    : new ethers.JsonRpcProvider(rpc);

  const repContract = new ethers.Contract(repAddr, ReputationScoreAbi.abi, provider);
  const regContract = new ethers.Contract(regAddr, AgentRegistryAbi.abi, provider);

  // ScoreUpdated(string indexed did, int256 newScore)
  repContract.on("ScoreUpdated", async (did: string) => {
    console.log(`[Reputation] ScoreUpdated for ${did} — invalidating cache`);
    await invalidateScoreCache(did);
  });

  // AgentBlacklisted(string indexed did)
  repContract.on("AgentBlacklisted", async (did: string) => {
    console.log(`[Reputation] AgentBlacklisted on-chain: ${did}`);
    await addToBlacklist(did, "on-chain score <= 0");
    await invalidateScoreCache(did);
  });

  // AgentDeactivated(string indexed did) — from registry
  regContract.on("AgentDeactivated", async (did: string) => {
    console.log(`[Registry] AgentDeactivated: ${did}`);
    await addToBlacklist(did, "on-chain deactivation");
  });

  started = true;
  console.log("[Reputation] Event listener started");
}
