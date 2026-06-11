/**
 * Scenario 1: "도쿄 3박 여행, 예산 100만원"
 *
 * 에이전트 구성:
 *   🤖 TravelPlanner  — 사용자 목표 브로드캐스트, 최적 조합 선택
 *   🤖 FlightAgent    — 항공권 조회 및 제안
 *   🤖 HotelAgent     — 호텔 조회 및 제안
 *   🤖 LocalGuide     — 맛집·날씨 정보 제공
 */
import { ethers } from "ethers";
import { HivagoraAgentSDK } from "../sdk/src/agent";
import { HubMessage } from "../sdk/src/types";
import { banner, divider, log } from "../sdk/src/logger";
import { buildDeal, formatKrw } from "../sdk/src/negotiation";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rndKey = () => ethers.hexlify(ethers.randomBytes(32));

async function main() {
  banner("Scenario 1 — 도쿄 3박 여행, 예산 100만원");

  // ── 에이전트 생성 ──────────────────────────────────────────────────────────
  const traveler = new HivagoraAgentSDK({ name: "TravelPlanner", privateKey: rndKey(), capabilities: ["travel", "budget"] });
  const flightBot = new HivagoraAgentSDK({ name: "FlightAgent",  privateKey: rndKey(), capabilities: ["flights", "skyscanner"] });
  const hotelBot  = new HivagoraAgentSDK({ name: "HotelAgent",   privateKey: rndKey(), capabilities: ["hotels", "agoda"] });
  const guide     = new HivagoraAgentSDK({ name: "LocalGuide",   privateKey: rndKey(), capabilities: ["food", "weather"] });

  await Promise.all([traveler.connect(), flightBot.connect(), hotelBot.connect(), guide.connect()]);

  const BUDGET = 1_000_000;
  const proposals: { source: string; price: number; content: unknown; from: string }[] = [];
  let dealId: string | undefined;

  // ── FlightAgent: broadcast 감지 → API 조회 → 제안 ──────────────────────────
  flightBot.on("broadcast", async (msg: HubMessage) => {
    const content = msg.content as { goal?: string; destination?: string };
    if (!JSON.stringify(content).includes("도쿄")) return;

    log("FlightAgent", "RECEIVED", `브로드캐스트 감지: "${JSON.stringify(content)}"`);

    // API Gateway로 항공권 조회
    const res = await flightBot.data.searchFlights("ICN", "NRT", "2026-07-15");
    const flights = (res.data as { flights: { airline: string; price: number; affiliateUrl: string }[] }).flights ?? [];
    const best = flights.sort((a, b) => a.price - b.price)[0];
    if (!best) return;

    // 환율 조회 (JPY→KRW 참고용)
    await flightBot.data.getExchangeRate("JPY");

    await sleep(400);
    const offerId = flightBot.negotiate(msg.from, {
      type: "flight",
      airline: best.airline,
      route: "ICN→NRT 왕복",
      price: best.price * 2, // round trip
      affiliateUrl: best.affiliateUrl,
    });
    proposals.push({ source: "FlightAgent", price: best.price * 2, content: best, from: flightBot["did"] });
    dealId = offerId;
  });

  // ── HotelAgent: broadcast 감지 → API 조회 → 제안 ──────────────────────────
  hotelBot.on("broadcast", async (msg: HubMessage) => {
    const content = msg.content as { goal?: string };
    if (!JSON.stringify(content).includes("도쿄")) return;

    log("HotelAgent", "RECEIVED", `브로드캐스트 감지`);

    const res = await hotelBot.data.searchHotels("도쿄", "2026-07-15", 500000);
    const hotels = (res.data as { hotels: { name: string; pricePerNight: number; rating: number; affiliateUrl: string }[] }).hotels ?? [];
    const best = hotels.sort((a, b) => a.pricePerNight - b.pricePerNight)[0];
    if (!best) return;

    await sleep(600);
    hotelBot.negotiate(msg.from, {
      type: "hotel",
      name: best.name,
      nights: 3,
      pricePerNight: best.pricePerNight,
      total: best.pricePerNight * 3,
      rating: best.rating,
      affiliateUrl: best.affiliateUrl,
    });
    proposals.push({ source: "HotelAgent", price: best.pricePerNight * 3, content: best, from: hotelBot["did"] });
  });

  // ── LocalGuide: broadcast 감지 → 날씨 + 맛집 제공 ─────────────────────────
  guide.on("broadcast", async (msg: HubMessage) => {
    if (!JSON.stringify(msg.content).includes("도쿄")) return;

    log("LocalGuide", "RECEIVED", `도쿄 정보 요청 감지`);
    const [weatherRes, foodRes] = await Promise.all([
      guide.data.getWeather("도쿄"),
      guide.data.searchFood("도쿄 신주쿠", "음식점"),
    ]);
    const weather = weatherRes.data as { condition: string; temperature: number };
    const places = (foodRes.data as { places: { name: string; category: string }[] }).places ?? [];

    await sleep(800);
    guide.sendDirect(msg.from, "direct", {
      type: "local_info",
      weather: `${weather.condition} ${weather.temperature}°C`,
      topRestaurants: places.slice(0, 3).map((p) => p.name),
    });
    log("LocalGuide", "INFO", `날씨 정보 + 맛집 ${places.length}곳 전송 완료`);
  });

  // ── TravelPlanner: negotiate 수신 → 예산 검증 → accept ───────────────────
  traveler.on("negotiate", async (msg: HubMessage) => {
    const proposal = msg.content as { type: string; price?: number; total?: number; affiliateUrl?: string };
    const price = proposal.total ?? proposal.price ?? 0;
    log("TravelPlanner", "RECEIVED", `${proposal.type} 제안 수신: ${formatKrw(price)}`);
    proposals.push({ source: proposal.type, price, content: proposal, from: msg.from });
    await sleep(200);
  });

  // ── TravelPlanner: direct 수신 (local_info) ───────────────────────────────
  traveler.on("direct", (msg: HubMessage) => {
    const info = msg.content as { type?: string; weather?: string; topRestaurants?: string[] };
    if (info.type === "local_info") {
      log("TravelPlanner", "RECEIVED", `현지 정보: 날씨=${info.weather}  맛집=${info.topRestaurants?.join(", ")}`);
    }
  });

  // ── 목표 브로드캐스트 ──────────────────────────────────────────────────────
  divider("에이전트 자율 협상 시작");
  traveler.broadcast({
    goal: "도쿄 3박 여행",
    destination: "도쿄",
    budget: BUDGET,
    dates: { from: "2026-07-15", nights: 3 },
    requirements: ["항공권", "호텔", "맛집 추천"],
  });

  // 협상 결과 집산 대기
  await sleep(3000);

  // ── 최적 조합 딜 확정 ──────────────────────────────────────────────────────
  divider("딜 확정");
  const flightProp = proposals.find((p) => p.source === "flight");
  const hotelProp  = proposals.find((p) => p.source === "hotel");
  const totalCost  = (flightProp?.price ?? 0) + (hotelProp?.price ?? 0);

  if (flightProp && hotelProp && totalCost <= BUDGET) {
    log("TravelPlanner", "INFO", `총 비용: ${formatKrw(totalCost)} / 예산: ${formatKrw(BUDGET)} — 예산 내 조합 확정`);

    const deal = buildDeal(
      `deal_tokyo_${Date.now()}`,
      traveler["did"],
      flightBot["did"],
      `도쿄 3박 여행 패키지 ${formatKrw(totalCost)}`,
      { flight: flightProp.content, hotel: hotelProp.content },
      [
        (flightProp.content as { affiliateUrl?: string }).affiliateUrl ?? "",
        (hotelProp.content as { affiliateUrl?: string }).affiliateUrl ?? "",
      ].filter(Boolean)
    );

    traveler.accept(flightProp.from, deal.dealId, deal);
    traveler.accept(hotelProp.from, deal.dealId, deal);

    log("TravelPlanner", "ONCHAIN", `deal_hash=${deal.dealHash.slice(0, 20)}…`);
    log("TravelPlanner", "DEAL", `💰 어필리에이트 링크 ${deal.affiliateLinks.length}개 포함`);
    deal.affiliateLinks.forEach((link, i) => log("TravelPlanner", "INFO", `  link[${i}]: ${link}`));
  } else {
    log("TravelPlanner", "INFO", `제안 집산 중... (총 제안 수: ${proposals.length})`);
  }

  await sleep(500);
  [traveler, flightBot, hotelBot, guide].forEach((a) => a.disconnect());
  log("TravelPlanner", "INFO", "Scenario 1 완료 ✅");
}

export { main };
if (require.main === module) main().catch(console.error);
