/**
 * LocalBus — process-local hub that mimics WebSocket routing.
 * Used when a real backend is not available (demo / offline mode).
 * All agent instances in the same process share this singleton.
 */
import { EventEmitter } from "events";
import { HubMessage } from "./types";

class LocalBus extends EventEmitter {
  private readonly clients = new Map<string, (msg: HubMessage) => void>();

  register(did: string, handler: (msg: HubMessage) => void): void {
    this.clients.set(did, handler);
  }

  unregister(did: string): void {
    this.clients.delete(did);
  }

  dispatch(message: HubMessage): void {
    if (message.type === "broadcast") {
      this.clients.forEach((handler, did) => {
        if (did !== message.from) handler(message);
      });
      return;
    }

    if (message.to) {
      const handler = this.clients.get(message.to);
      if (handler) handler(message);
    }
  }

  get size(): number {
    return this.clients.size;
  }
}

export const localBus = new LocalBus();
