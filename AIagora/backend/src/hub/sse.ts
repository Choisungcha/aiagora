import { Response } from "express";

// DID → active SSE response
const sseClients = new Map<string, Response>();
const heartbeatTimers = new Map<string, NodeJS.Timeout>();

export function registerSSE(did: string, res: Response): void {
  // Close any existing connection for this DID
  const existing = sseClients.get(did);
  if (existing && !existing.writableEnded) {
    try { existing.end(); } catch { /* ignore */ }
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // prevent nginx from buffering

  res.flushHeaders();
  sseClients.set(did, res);

  // Send heartbeat comment every 20 s to keep connection alive through proxies
  const timer = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(timer);
      sseClients.delete(did);
      heartbeatTimers.delete(did);
      return;
    }
    try { res.write(": heartbeat\n\n"); } catch { /* ignore */ }
  }, 20_000);
  heartbeatTimers.set(did, timer);

  res.on("close", () => {
    clearInterval(timer);
    sseClients.delete(did);
    heartbeatTimers.delete(did);
  });
}

export function removeSSE(did: string): void {
  const timer = heartbeatTimers.get(did);
  if (timer) { clearInterval(timer); heartbeatTimers.delete(did); }

  const res = sseClients.get(did);
  if (res && !res.writableEnded) {
    try { res.end(); } catch { /* ignore */ }
  }
  sseClients.delete(did);
}

export function sendToSSE(did: string, data: unknown): boolean {
  const res = sseClients.get(did);
  if (!res || res.writableEnded) return false;
  try {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch {
    return false;
  }
}

export function broadcastSSE(data: unknown, excludeDid?: string): number {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  let count = 0;
  sseClients.forEach((res, did) => {
    if (did === excludeDid || res.writableEnded) return;
    try { res.write(payload); count++; } catch { /* ignore */ }
  });
  return count;
}

export function getSSEClientCount(): number {
  return sseClients.size;
}

export function getSSEClientList(): string[] {
  return [...sseClients.keys()];
}
