import { getPubClient, getSubClient } from "../db/redis";
import { broadcastSSE, sendToSSE } from "./sse";
import { HubMessage } from "../types/agent";

let subscribed = false;

/**
 * Initialise Redis pattern-subscribe on hub:* channels.
 * Must be called once at server startup.
 * Falls back to direct SSE delivery if Redis is unavailable.
 */
export async function initPubSub(): Promise<void> {
  if (subscribed) return;

  const sub = getSubClient();
  if (!sub) {
    console.warn("[PubSub] Redis unavailable — direct SSE delivery only");
    return;
  }

  await sub.psubscribe("hub:*");
  subscribed = true;

  sub.on("pmessage", (_pattern: string, channel: string, raw: string) => {
    let msg: HubMessage;
    try {
      msg = JSON.parse(raw) as HubMessage;
    } catch {
      console.warn("[PubSub] Malformed message on", channel);
      return;
    }

    if (channel === "hub:broadcast") {
      broadcastSSE(msg, msg.from); // exclude sender
    } else if (channel.startsWith("hub:direct:")) {
      const did = channel.slice("hub:direct:".length);
      sendToSSE(did, msg);
    }
  });

  sub.on("error", (err: Error) => {
    console.warn("[PubSub] Subscriber error:", err.message);
  });

  console.log("[PubSub] Subscribed to hub:* channels via Redis");
}

/**
 * Publish a message to a hub channel.
 *
 * Channels:
 *   hub:broadcast          → delivered to all SSE clients (except sender)
 *   hub:direct:{did}       → delivered to a specific agent's SSE stream
 *
 * If Redis is down, falls back to direct in-process SSE delivery.
 */
export async function publish(channel: string, data: unknown): Promise<void> {
  const pub = getPubClient();

  if (!pub) {
    // Direct in-process fallback (single-instance mode)
    const msg = data as HubMessage;
    if (channel === "hub:broadcast") {
      broadcastSSE(msg, msg.from);
    } else if (channel.startsWith("hub:direct:")) {
      const did = channel.slice("hub:direct:".length);
      sendToSSE(did, msg);
    }
    return;
  }

  try {
    await pub.publish(channel, JSON.stringify(data));
  } catch (err) {
    console.warn("[PubSub] Publish error:", (err as Error).message);
  }
}
