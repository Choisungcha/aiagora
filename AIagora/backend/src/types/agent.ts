export interface HivagoraAgent {
  did: string;           // did:hivagora:xxxx
  capabilities: string[];
  reputation: number;
  stake: string;         // wei string
  endpoint: string;
  owner: string;         // Ethereum address
  isActive: boolean;
}

export interface DidDocument {
  "@context": string[];
  id: string;
  verificationMethod: VerificationMethod[];
  authentication: string[];
  service?: ServiceEndpoint[];
}

export interface VerificationMethod {
  id: string;
  type: string;
  controller: string;
  blockchainAccountId?: string;
  publicKeyHex?: string;
}

export interface ServiceEndpoint {
  id: string;
  type: string;
  serviceEndpoint: string;
}

export type HubMessageType =
  | "broadcast"
  | "direct"
  | "negotiate"
  | "accept"
  | "reject"
  | "propose_bundle"
  | "join_bundle"
  | "ping"
  | "pong"
  | "knowledge_share"    // 에이전트가 시장 인텔리전스 공유
  | "knowledge_vote"     // 에이전트가 지식을 검증/반박
  | "knowledge_request"  // 에이전트가 특정 주제 지식 요청
  | "knowledge_update";  // hub가 갱신된 지식을 broadcast

export interface HubMessage {
  type: HubMessageType;
  from: string;         // sender DID (set server-side, not trusted from client)
  to?: string;          // target DID for direct messages
  content: unknown;
  signature?: string;
  ttl?: number;         // Unix ms expiry — server sets 30s for negotiate/propose
  dealId?: string;
}

export interface PendingOffer {
  message: HubMessage;
  expiresAt: number;    // Unix ms
  timer: ReturnType<typeof setTimeout>;
}

export interface TokenPayload {
  did: string;
  address: string;
  iat: number;
  exp: number;
}

export interface AiChallenge {
  nonce: string;
  timestamp: number;
  difficulty: number;   // leading zero bits required in SHA-256(nonce+answer)
  expiresAt: number;
}

// ── Agent Knowledge Network ───────────────────────────────────────────────────

export type KnowledgeCategory =
  | "price"    // 가격 정보 (상품/부동산/주식)
  | "trend"    // 트렌드 (검색량/소비패턴)
  | "market"   // 시장 데이터 (환율/암호화폐)
  | "deal"     // 딜 기회 (한정 특가/재고)
  | "review"   // 리뷰/평가 (에이전트 경험)
  | "general"; // 기타

export interface KnowledgeEntry {
  id: string;
  authorDid: string;
  topic: string;        // "price:아이폰15", "trend:여행", "market:BTC"
  category: KnowledgeCategory;
  title: string;
  summary: string;
  data: unknown;        // 원본 데이터
  confidence: number;   // 0-1 (에이전트 자기 신뢰도)
  source: string;       // 출처 (API 이름 or 경험)
  timestamp: number;
  expiresAt: number;    // 지식 만료 시각 (카테고리별 TTL)
  votes: number;        // 검증 투표 (양수=신뢰, 음수=반박)
  sharedCount: number;  // 재공유 횟수
}

export interface KnowledgeVote {
  entryId: string;
  voterDid: string;
  valid: boolean;       // true=검증, false=반박
  reason?: string;
}
