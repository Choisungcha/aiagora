import { router } from "./router";

export function getActiveAgents() {
  return Array.from(router.clients.keys()).map((did) => ({
    did,
    status: "online",
    lastActive: new Date().toISOString(),
  }));
}
