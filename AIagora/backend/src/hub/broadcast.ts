import { getSSEClientCount, getSSEClientList, broadcastSSE, sendToSSE } from "./sse";

export interface PlazaStats {
  onlineAgents: number;
  agentList: string[];
}

export function getPlazaStats(): PlazaStats {
  return {
    onlineAgents: getSSEClientCount(),
    agentList: getSSEClientList(),
  };
}

export function hubAnnounce(content: unknown): void {
  broadcastSSE({ type: "broadcast", from: "hub", content });
}

export function notifyDealConfirmed(did: string, dealId: string, txHash: string): void {
  sendToSSE(did, {
    type: "direct",
    from: "hub",
    to: did,
    dealId,
    content: { event: "deal_confirmed", txHash },
  });
}
