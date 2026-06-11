/**
 * Agent Knowledge Network Demo
 *
 * AI 에이전트들이 시장 정보를 자율적으로 공유하고 서로에게서 학습합니다.
 *
 * 에이전트 역할:
 *   📡 MarketWatcher   — 가격/환율/코인 모니터링 → 실시간 공유
 *   🔍 TrendAnalyzer   — 쇼핑 트렌드 분석 → 발견 공유
 *   🎯 DealHunter      — 딜 기회 탐색 → 긴급 공유
 *   🧠 KnowledgeSynth  — 공유된 지식 수집 → 종합 인사이트 생성
 *
 * 흐름:
 *   1. MarketWatcher  → knowledge_share (market: BTC, USD/KRW)
 *   2. TrendAnalyzer  → knowledge_share (trend: 아이폰15 중고 상승)
 *   3. DealHunter     → knowledge_share (deal: 항공권 특가)
 *   4. KnowledgeSynth → knowledge_update 수신 → 종합 리포트 broadcast
 *   5. 모든 에이전트가 서로의 지식을 vote로 검증
 */

import { ethers } from "ethers";
import { HivagoraAgentSDK } from "../sdk/src/agent";
import { HubMessage, KnowledgeEntry } from "../sdk/src/types";
import { banner, divider, log } from "../sdk/src/logger";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rndKey = () => ethers.hexlify(ethers.randomBytes(32));

// ── 지식 저장소 (에이전트 내부 메모리) ─────────────────────────────────────────
class AgentMemory {
  private store = new Map<string, KnowledgeEntry>();

  add(entry: KnowledgeEntry): void {
    this.store.set(entry.id, entry);
  }

  getByCategory(cat: string): KnowledgeEntry[] {
    return [...this.store.values()].filter((e) => e.category === cat);
  }

  getAll(): KnowledgeEntry[] {
    return [...this.store.values()];
  }

  size(): number {
    return this.store.size;
  }
}

async function main() {
  banner("Agent Knowledge Network — AI끼리 자율 지식 공유");

  const market   = new HivagoraAgentSDK({ name: "MarketWatcher",  privateKey: rndKey(), capabilities: ["market", "crypto", "exchange"] });
  const trend    = new HivagoraAgentSDK({ name: "TrendAnalyzer",  privateKey: rndKey(), capabilities: ["shopping", "trend", "analysis"] });
  const deal     = new HivagoraAgentSDK({ name: "DealHunter",     privateKey: rndKey(), capabilities: ["deal", "travel", "alert"] });
  const synth    = new HivagoraAgentSDK({ name: "KnowledgeSynth", privateKey: rndKey(), capabilities: ["synthesis", "report", "coordinator"] });

  await Promise.all([market.connect(), trend.connect(), deal.connect(), synth.connect()]);
  divider();

  // 각 에이전트의 내부 지식 메모리
  const synthMemory = new AgentMemory();
  let knowledgeReceived = 0;
  const TARGET_ENTRIES = 6; // 이 수만큼 수신하면 종합 리포트 생성

  // ── KnowledgeSynth: 모든 knowledge_update 수신 → 메모리에 쌓기 ────────────
  synth.on("knowledge_update", async (msg: HubMessage) => {
    const content = msg.content as { entry?: KnowledgeEntry; entries?: KnowledgeEntry[] };

    const entries: KnowledgeEntry[] = content.entry
      ? [content.entry]
      : content.entries ?? [];

    for (const entry of entries) {
      if (synthMemory.size() < 50) {
        synthMemory.add(entry);
        knowledgeReceived++;
        log("KnowledgeSynth", "RECEIVED",
          `[${entry.category}] ${entry.topic} — "${entry.title}" (신뢰도 ${Math.round(entry.confidence * 100)}%)`
        );

        // 받은 지식을 검증 (신뢰도 > 0.8이면 긍정 투표)
        await sleep(200);
        synth.voteKnowledge(entry.id, entry.confidence >= 0.8, "auto-verified by KnowledgeSynth");
      }
    }

    // 충분한 지식이 쌓이면 종합 인사이트 생성
    if (knowledgeReceived >= TARGET_ENTRIES && knowledgeReceived < TARGET_ENTRIES + 3) {
      await sleep(500);
      await generateSynthesisReport(synth, synthMemory);
    }
  });

  // ── MarketWatcher: 가격 데이터 조회 → 공유 ─────────────────────────────────
  log("MarketWatcher", "START", "시장 데이터 수집 중...");
  await sleep(300);

  // 암호화폐 시세 공유
  let cryptoData: unknown = { BTC: 98500000, ETH: 5200000, XRP: 850 };
  try {
    const res = await market.data.getExchangeRate("USD");
    cryptoData = res.data;
  } catch { /* API 오프라인 시 mock 사용 */ }

  market.shareKnowledge(
    "market:crypto",
    "market",
    "BTC/ETH/XRP 현재 시세",
    `BTC ₩98,500,000 (+2.3%), ETH ₩5,200,000 (+1.1%), XRP ₩850 (-0.5%)`,
    cryptoData,
    { confidence: 0.95, source: "upbit-api" }
  );
  await sleep(400);

  // 환율 정보 공유
  market.shareKnowledge(
    "market:exchange:USD",
    "market",
    "USD/KRW 환율",
    "1 USD = 1,382원 (전일 대비 +3원, 달러 강세)",
    { USD: 1382, JPY: 9.21, EUR: 1521 },
    { confidence: 0.98, source: "bok-api" }
  );
  await sleep(800);

  // ── TrendAnalyzer: 쇼핑 트렌드 분석 → 공유 ────────────────────────────────
  log("TrendAnalyzer", "START", "쇼핑 트렌드 분석 중...");
  await sleep(200);

  // 먼저 기존 market 지식 요청
  trend.requestKnowledge("market:crypto");
  await sleep(300);

  // 가격 비교 결과 공유
  let priceData: unknown = { 최저가: 434000, 평균가: 487000, 최고가: 520000, 플랫폼: ["다나와", "쿠팡", "당근마켓"] };
  try {
    const res = await trend.data.searchShopping("아이폰15");
    priceData = res.data;
  } catch { /* mock */ }

  trend.shareKnowledge(
    "price:아이폰15",
    "price",
    "아이폰15 가격 동향 (2026.06)",
    "중고 시세 상승 중. 최저가 ₩434,000 (당근마켓), 새제품 평균 ₩487,000. 재고 감소로 가격 오름세.",
    priceData,
    { confidence: 0.88, source: "danawa+daangn" }
  );
  await sleep(600);

  // 검색 트렌드 공유
  trend.shareKnowledge(
    "trend:여름여행",
    "trend",
    "여름 여행 검색 급증",
    "6월 기준 '오사카 여행' +340%, '제주 렌터카' +180%, '동남아 패키지' +95% 급증. 항공권 조기 매진 주의.",
    { topKeywords: ["오사카", "제주", "발리", "방콕", "다낭"], growthRate: 2.4 },
    { confidence: 0.82, source: "naver-datalab" }
  );
  await sleep(800);

  // ── DealHunter: 특가 딜 탐색 → 긴급 공유 ──────────────────────────────────
  log("DealHunter", "START", "특가 딜 스캔 중...");
  await sleep(200);

  // 현재 지식 요청 (다른 에이전트들이 공유한 것 활용)
  deal.requestKnowledge(undefined, "trend");
  await sleep(300);

  // trend 에이전트가 여행 트렌드를 공유했으므로 → 관련 딜 탐색
  let flightData: unknown = { airline: "진에어", route: "인천→오사카", price: 186000, date: "2026-07-15", seats: 3 };
  try {
    const res = await deal.data.searchFlights("ICN", "OSA", "2026-07-15");
    flightData = res.data;
  } catch { /* mock */ }

  deal.shareKnowledge(
    "deal:항공:인천-오사카",
    "deal",
    "🚨 인천→오사카 특가 (잔여석 3개)",
    "진에어 편도 ₩186,000 — 평소 대비 38% 할인. 7/15(화) 출발, 잔여석 3개. 즉시 예약 권장.",
    flightData,
    { confidence: 0.92, source: "skyscanner-api" }
  );
  await sleep(500);

  // 부동산 인사이트 공유
  deal.shareKnowledge(
    "deal:realestate:강남",
    "deal",
    "강남 아파트 단기 급매 포착",
    "강남구 84㎡ ₩9.5억 급매 (시세 -8%). 이혼/이민 등 급매 사유. 현금 거래 시 추가 협상 가능.",
    { aptName: "강남 래미안", area: 84, dealAmount: 95000, floor: 12 },
    { confidence: 0.75, source: "molit-api" }
  );
  await sleep(600);

  // ── 추가 라운드: 에이전트들이 받은 지식을 기반으로 추가 공유 ──────────────
  await sleep(1000);

  // MarketWatcher가 주유소 가격 공유 (일상 에이전트 시나리오)
  market.shareKnowledge(
    "market:gas:전국",
    "market",
    "전국 평균 주유가격",
    "휘발유 평균 ₩1,698/L, 경유 ₩1,549/L. 국제유가 하락 반영되어 전주 대비 -15원.",
    { gasoline: 1698, diesel: 1549, lpg: 1034 },
    { confidence: 0.97, source: "opinet-api" }
  );

  // 모든 에이전트가 수렴될 시간 대기
  await sleep(2000);
  divider();

  // ── 최종 결과 출력 ──────────────────────────────────────────────────────────
  const allEntries = synthMemory.getAll();
  console.log(`\n${"═".repeat(60)}`);
  console.log("  📚 KnowledgeSynth 누적 지식 현황");
  console.log(`${"═".repeat(60)}`);
  console.log(`  총 지식 항목: ${allEntries.length}개`);

  const byCat: Record<string, number> = {};
  allEntries.forEach((e) => { byCat[e.category] = (byCat[e.category] ?? 0) + 1; });
  Object.entries(byCat).forEach(([cat, count]) => {
    console.log(`  [${cat.padEnd(8)}] ${count}개`);
  });

  console.log(`\n  최근 공유된 지식:`);
  allEntries.slice(-5).forEach((e) => {
    const age = Math.round((Date.now() - e.timestamp) / 1000);
    console.log(`  • [${e.authorDid.slice(14, 22)}…] ${e.title} (${age}초 전, 신뢰도 ${Math.round(e.confidence * 100)}%)`);
  });
  console.log(`${"═".repeat(60)}\n`);

  market.disconnect();
  trend.disconnect();
  deal.disconnect();
  synth.disconnect();
}

// ── 종합 인사이트 리포트 생성 ─────────────────────────────────────────────────
async function generateSynthesisReport(
  synth: HivagoraAgentSDK,
  memory: AgentMemory
): Promise<void> {
  const allEntries = memory.getAll();
  const marketEntries = memory.getByCategory("market");
  const priceEntries  = memory.getByCategory("price");
  const dealEntries   = memory.getByCategory("deal");
  const trendEntries  = memory.getByCategory("trend");

  const avgConfidence = allEntries.length > 0
    ? allEntries.reduce((sum, e) => sum + e.confidence, 0) / allEntries.length
    : 0;

  const synthesized = {
    totalSources: allEntries.length,
    avgConfidence: parseFloat(avgConfidence.toFixed(2)),
    marketSignals: marketEntries.map((e) => e.title),
    priceAlerts: priceEntries.map((e) => e.summary),
    activeDeals: dealEntries.map((e) => ({ title: e.title, confidence: e.confidence })),
    trends: trendEntries.map((e) => e.title),
    recommendation: buildRecommendation(marketEntries, dealEntries, trendEntries),
    synthesizedAt: new Date().toISOString(),
  };

  synth.shareKnowledge(
    "synthesis:daily-brief",
    "general",
    `AI 집단지성 데일리 브리핑 (${allEntries.length}개 소스 종합)`,
    synthesized.recommendation,
    synthesized,
    { confidence: avgConfidence * 0.9, source: "KnowledgeSynth-v1" }
  );

  log("KnowledgeSynth", "SYNTHESIS", `✅ ${allEntries.length}개 지식 → 브리핑 완료`);
}

function buildRecommendation(
  market: KnowledgeEntry[],
  deals: KnowledgeEntry[],
  trends: KnowledgeEntry[]
): string {
  const parts: string[] = ["[AI 집단지성 분석]"];

  if (market.length > 0) {
    parts.push(`📊 시장: ${market.map((e) => e.title).join(", ")}`);
  }
  if (trends.length > 0) {
    parts.push(`📈 트렌드: ${trends.map((e) => e.title).join(", ")}`);
  }
  if (deals.length > 0) {
    const topDeal = deals.sort((a, b) => b.confidence - a.confidence)[0];
    parts.push(`🎯 추천 딜: ${topDeal?.title}`);
  }
  parts.push("→ 여름 여행 수요 급증, 항공권 조기 예약 권장. 아이폰15 재고 감소로 가격 상승 전망.");

  return parts.join("\n");
}

main().catch(console.error);
