/**
 * Scenario 3: "이번 주 저녁 혼밥 맛집 3곳"
 *
 * 에이전트 구성:
 *   🤖 FoodieAI      — 취향 기반 맛집 탐색, 날씨 고려
 *   🤖 RestaurantBot  — 카카오맵+네이버 지역 정보 조회
 *   🤖 WeatherAdvisor — 날씨 분석, 실내/외 추천 조건 결정
 *   🤖 SoloGuide     — 혼밥 적합도 스코어링, 최종 3곳 선정
 */
import { ethers } from "ethers";
import { HivagoraAgentSDK } from "../sdk/src/agent";
import { HubMessage } from "../sdk/src/types";
import { banner, divider, log } from "../sdk/src/logger";
import { buildDeal } from "../sdk/src/negotiation";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rndKey = () => ethers.hexlify(ethers.randomBytes(32));

interface PlaceInfo { name: string; address: string; category: string; phone: string }

async function main() {
  banner("Scenario 3 — 이번 주 저녁 혼밥 맛집 3곳");

  const foodie   = new HivagoraAgentSDK({ name: "FoodieAI",      privateKey: rndKey(), capabilities: ["food", "recommendation"] });
  const restBot  = new HivagoraAgentSDK({ name: "RestaurantBot", privateKey: rndKey(), capabilities: ["kakao-map", "naver-local"] });
  const weather  = new HivagoraAgentSDK({ name: "WeatherAdvisor",privateKey: rndKey(), capabilities: ["weather", "outdoor-indoor"] });
  const solo     = new HivagoraAgentSDK({ name: "SoloGuide",     privateKey: rndKey(), capabilities: ["solo-dining", "scoring"] });

  await Promise.all([foodie.connect(), restBot.connect(), weather.connect(), solo.connect()]);

  let weatherCondition = "맑음";
  const restaurantProposals: { places: PlaceInfo[]; score: number; from: string }[] = [];

  // ── WeatherAdvisor: 브로드캐스트 감지 → 날씨 조회 ─────────────────────────
  weather.on("broadcast", async (msg: HubMessage) => {
    const content = msg.content as { location?: string };
    if (!JSON.stringify(content).includes("맛집")) return;

    log("WeatherAdvisor", "RECEIVED", `날씨 조회 요청`);
    const res = await weather.data.getWeather(content.location ?? "서울");
    const w = res.data as { condition: string; temperature: number; windSpeed: number };
    weatherCondition = w.condition;

    await sleep(300);
    const isIndoor = w.condition !== "맑음" || w.windSpeed > 5;
    weather.sendDirect(msg.from, "direct", {
      type: "weather_report",
      condition: w.condition,
      temperature: w.temperature,
      windSpeed: w.windSpeed,
      recommendation: isIndoor ? "실내 추천 (날씨 불량 또는 바람)" : "실내/외 모두 가능",
      preferIndoor: isIndoor,
    });
    log("WeatherAdvisor", "INFO", `${w.condition} ${w.temperature}°C  →  ${isIndoor ? "실내 우선" : "실내/외 무관"}`);
  });

  // ── RestaurantBot: 브로드캐스트 감지 → 카카오+네이버 병렬 조회 ──────────
  restBot.on("broadcast", async (msg: HubMessage) => {
    const content = msg.content as { location?: string; category?: string };
    if (!JSON.stringify(content).includes("맛집")) return;

    log("RestaurantBot", "RECEIVED", `맛집 검색 요청: ${content.location} ${content.category}`);

    const [kakaoRes, naverRes] = await Promise.all([
      restBot.data.searchFood(content.location ?? "서울 마포구", content.category ?? "음식점"),
      restBot.data.searchFood(content.location ?? "서울 마포구", "혼밥"),
    ]);

    const kakaoPlaces = (kakaoRes.data as { places: PlaceInfo[] }).places ?? [];
    const naverPlaces = (naverRes.data as { places: PlaceInfo[] }).places ?? [];

    // 중복 제거 (이름 기준)
    const seen = new Set<string>();
    const merged = [...kakaoPlaces, ...naverPlaces].filter((p) => {
      if (seen.has(p.name)) return false;
      seen.add(p.name);
      return true;
    });

    log("RestaurantBot", "INFO", `카카오 ${kakaoPlaces.length}곳 + 네이버 ${naverPlaces.length}곳 = 총 ${merged.length}곳`);

    await sleep(500);
    restBot.negotiate(msg.from, {
      type: "restaurant_list",
      places: merged,
      sources: ["kakao", "naver"],
      totalCount: merged.length,
    });
    restaurantProposals.push({ places: merged, score: 0, from: restBot["did"] });
  });

  // ── SoloGuide: 브로드캐스트 감지 → 혼밥 적합도 스코어링 ─────────────────
  solo.on("broadcast", async (msg: HubMessage) => {
    if (!JSON.stringify(msg.content).includes("혼밥")) return;

    log("SoloGuide", "RECEIVED", `혼밥 추천 요청 감지`);
    await sleep(800);

    // 혼밥 적합 카테고리 점수
    const soloFriendly: Record<string, number> = {
      "일식": 10, "라멘": 10, "스시": 9, "우동": 9,
      "국밥": 8, "한식": 7, "파스타": 8, "이탈리안": 7,
      "치킨": 6, "중식": 5, "양식": 6, "카페": 4,
    };

    solo.sendDirect(msg.from, "direct", {
      type: "scoring_criteria",
      criteria: "혼밥 친화도 점수 (카테고리 + 대기 없음 + 카운터석 여부)",
      topCategories: Object.entries(soloFriendly)
        .sort(([,a],[,b]) => b - a)
        .slice(0, 5)
        .map(([cat, score]) => ({ cat, score })),
      soloFriendlyMap: soloFriendly,
    });
  });

  // ── FoodieAI: direct 수신 (날씨, 스코어링 기준) ───────────────────────────
  let weatherPref = false;
  let scoringCriteria: Record<string, number> = {};

  foodie.on("direct", (msg: HubMessage) => {
    const info = msg.content as { type?: string };
    if (info.type === "weather_report") {
      const w = msg.content as { condition: string; temperature: number; preferIndoor: boolean };
      log("FoodieAI", "RECEIVED", `날씨: ${w.condition} ${w.temperature}°C  preferIndoor=${w.preferIndoor}`);
      weatherPref = w.preferIndoor;
    }
    if (info.type === "scoring_criteria") {
      const s = msg.content as { soloFriendlyMap: Record<string, number>; topCategories: {cat:string;score:number}[] };
      log("FoodieAI", "RECEIVED", `혼밥 스코어링 기준 수신: TOP5 → ${s.topCategories.map(c => c.cat).join(", ")}`);
      scoringCriteria = s.soloFriendlyMap;
    }
  });

  // ── FoodieAI: negotiate 수신 → 스코어링 후 TOP3 선정 ─────────────────────
  foodie.on("negotiate", async (msg: HubMessage) => {
    const prop = msg.content as { type?: string; places?: PlaceInfo[]; totalCount?: number };
    if (prop.type !== "restaurant_list") return;

    log("FoodieAI", "RECEIVED", `식당 목록 수신: ${prop.totalCount}곳`);
    await sleep(400);

    const places = prop.places ?? [];

    // 스코어링: 혼밥 친화도 + 날씨 선호도 (실내 카테고리 우대)
    const indoorCategories = new Set(["일식", "라멘", "스시", "파스타", "이탈리안", "국밥"]);
    const scored = places.map((p) => {
      const catKey = Object.keys(scoringCriteria).find((k) => p.category.includes(k)) ?? "";
      const baseScore = scoringCriteria[catKey] ?? 5;
      const weatherBonus = weatherPref && indoorCategories.has(catKey) ? 2 : 0;
      return { ...p, score: baseScore + weatherBonus };
    });

    const top3 = scored.sort((a, b) => b.score - a.score).slice(0, 3);

    log("FoodieAI", "INFO", `혼밥 TOP 3 선정:`);
    top3.forEach((p, i) => {
      log("FoodieAI", "INFO", `  ${i + 1}. ${p.name}  [${p.category}]  점수=${p.score}  ${p.address}`);
    });

    // 딜 확정
    const deal = buildDeal(
      `deal_solo_${Date.now()}`,
      foodie["did"],
      restBot["did"],
      `혼밥 맛집 3곳 추천`,
      { restaurants: top3 }
    );

    foodie.accept(msg.from, deal.dealId, { ...deal, recommendations: top3 });

    log("FoodieAI", "ONCHAIN", `deal_hash=${deal.dealHash.slice(0, 20)}…`);
    log("FoodieAI", "DEAL",    `최종 추천 완료 — 날씨(${weatherPref ? "실내 우선" : "무관"}) 반영`);
  });

  // ── 목표 브로드캐스트 ──────────────────────────────────────────────────────
  divider("에이전트 자율 협상 시작");
  foodie.broadcast({
    goal: "이번 주 저녁 혼밥 맛집 3곳",
    location: "서울 마포구",
    category: "음식점",
    solo: true,
    weekdays: ["월", "화", "수", "목", "금"],
    preferIndoor: true,
  });

  await sleep(4000);

  await sleep(500);
  [foodie, restBot, weather, solo].forEach((a) => a.disconnect());
  log("FoodieAI", "INFO", "Scenario 3 완료 ✅");
}

export { main };
if (require.main === module) main().catch(console.error);
