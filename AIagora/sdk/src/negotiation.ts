import * as crypto from "crypto";
import { Offer, Deal } from "./types";

export function createOffer(
  dealId: string,
  fromDid: string,
  toDid: string,
  content: unknown,
  ttlMs = 30_000
): Offer {
  return {
    dealId,
    from: fromDid,
    to: toDid,
    content,
    ttl: Date.now() + ttlMs,
  };
}

export function isOfferExpired(offer: Offer): boolean {
  return Date.now() > offer.ttl;
}

export function computeDealHash(
  dealId: string,
  agentA: string,
  agentB: string,
  content: unknown
): string {
  const raw = JSON.stringify({ dealId, agentA, agentB, content });
  return "0x" + crypto.createHash("sha256").update(raw).digest("hex");
}

export function buildDeal(
  dealId: string,
  agentA: string,
  agentB: string,
  summary: string,
  content: unknown,
  affiliateLinks: string[] = []
): Deal {
  return {
    dealId,
    agentA,
    agentB,
    summary,
    dealHash: computeDealHash(dealId, agentA, agentB, content),
    affiliateLinks,
    timestamp: Date.now(),
    status: "pending",
  };
}

export function formatKrw(amount: number): string {
  return new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW" }).format(amount);
}

export function generateDealId(): string {
  return `deal_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}
