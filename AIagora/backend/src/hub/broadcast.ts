import { router } from "./router";

export interface PlazaStats {
  onlineAgents: number;
  agentList: string[];
}

export function getPlazaStats(): PlazaStats {
  return {
    onlineAgents: router.clients.size,
    agentList: router.getOnlineAgents(),
  };
}

/**
 * Sends a system-level broadcast from the hub itself.
 * Used for announcements, deal confirmations, alerts.
 */
export function hubAnnounce(content: unknown): void {
  router.clients.forEach((ws, _did) => {
    if (ws.readyState === 1 /* OPEN */) {
      ws.send(
        JSON.stringify({
          type: "broadcast",
          from: "hub",
          content,
        })
      );
    }
  });
}

/**
 * Notifies a specific agent of a deal confirmation after on-chain recording.
 */
export function notifyDealConfirmed(
  did: string,
  dealId: string,
  txHash: string
): void {
  router.sendTo(did, {
    type: "direct",
    from: "hub",
    to: did,
    dealId,
    content: { event: "deal_confirmed", txHash },
  });
}
