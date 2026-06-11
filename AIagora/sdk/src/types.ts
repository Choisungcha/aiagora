export interface AgentConfig {
  name: string;
  privateKey: string;
  capabilities: string[];
  hubUrl?: string;         // ws://localhost:4001/hivagora/hub
  gatewayUrl?: string;     // http://localhost:4000
  backendUrl?: string;     // http://localhost:4001
}

export interface HivagoraAgent {
  did: string;
  name: string;
  capabilities: string[];
  reputation: number;
  stake: number;
  endpoint: string;
}

export type MessageType =
  | "broadcast"
  | "direct"
  | "negotiate"
  | "accept"
  | "reject"
  | "propose_bundle"
  | "join_bundle"
  | "ping"
  | "pong"
  | "knowledge_share"
  | "knowledge_vote"
  | "knowledge_request"
  | "knowledge_update";

// ── Agent Knowledge Network ───────────────────────────────────────────────────

export type KnowledgeCategory =
  | "price" | "trend" | "market" | "deal" | "review" | "general";

export interface KnowledgeEntry {
  id: string;
  authorDid: string;
  topic: string;
  category: KnowledgeCategory;
  title: string;
  summary: string;
  data: unknown;
  confidence: number;
  source: string;
  timestamp: number;
  expiresAt: number;
  votes: number;
  sharedCount: number;
}

export interface HubMessage {
  type: MessageType;
  from: string;
  to?: string;
  content: unknown;
  signature?: string;
  ttl?: number;
  dealId?: string;
}

export interface Offer {
  dealId: string;
  from: string;
  to: string;
  content: unknown;
  ttl: number;        // Unix ms expiry
  signature?: string;
}

export interface Deal {
  dealId: string;
  agentA: string;
  agentB: string;
  summary: string;
  dealHash: string;
  affiliateLinks: string[];
  timestamp: number;
  status: "pending" | "confirmed" | "rejected";
}

// ── GatewayResponse mirrors api-gateway types ─────────────────────────────────
export interface GatewayResponse<T = unknown> {
  source: string;
  data: T;
  affiliate: string | null;
  cachedAt: number;
  ttl: number;
}

export interface ProductItem {
  id: string;
  name: string;
  price: number;
  imageUrl: string;
  link: string;
  source: string;
}

export interface FlightResult {
  from: string;
  to: string;
  date: string;
  price: number;
  airline: string;
  duration: string;
  affiliateUrl: string;
}

export interface HotelResult {
  id: string;
  name: string;
  location: string;
  pricePerNight: number;
  rating: number;
  reviewCount: number;
  affiliateUrl: string;
}

export interface PlaceResult {
  id: string;
  name: string;
  address: string;
  category: string;
  phone: string;
  lat: number;
  lng: number;
}

export interface WeatherResult {
  location: string;
  temperature: number;
  condition: string;
  humidity: number;
  windSpeed: number;
}

export interface ExchangeResult {
  currency: string;
  rate: number;
  unit: number;
  date: string;
}
