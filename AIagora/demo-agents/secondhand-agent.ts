/**
 * Scenario 2: "아이폰15 50만원 이하"
 *
 * 에이전트 구성:
 *   🤖 iPhoneBuyer    — 워치리스트 등록, 가격 조건 브로드캐스트
 *   🤖 ShopScout      — 쿠팡+네이버 실시간 시세 조회 후 제안
 *   🤖 SecondhandBot  — 중고 매물 스캔 후 제안
 *   🤖 PriceMatcher   — 최저가 매칭 오케스트레이터
 */
import { ethers } from "ethers";
import { HivagoraAgentSDK } from "../sdk/src/agent";
import { HubMessage } from "../sdk/src/types";
import { banner, divider, log } from "../sdk/src/logger";
import { buildDeal, formatKrw } from "../sdk/src/negotiation";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rndKey = () => ethers.hexlify(ethers.randomBytes(32));

async function main() {
  banner("Scenario 2 — 아이폰15 50만원 이하 중고거래");

  const buyer       = new HivagoraAgentSDK({ name: "iPhoneBuyer",   privateKey: rndKey(), capabilities: ["shopping", "watchlist"] });
  const shopScout   = new HivagoraAgentSDK({ name: "ShopScout",     privateKey: rndKey(), capabilities: ["coupang", "naver", "price-watch"] });
  const secondhand  = new HivagoraAgentSDK({ name: "SecondhandBot", privateKey: rndKey(), capabilities: ["used", "secondhand", "naver-cafe"] });
  const matcher     = new HivagoraAgentSDK({ name: "PriceMatcher",  privateKey: rndKey(), capabilities: ["price-analysis", "arbitrage"] });

  await Promise.all([buyer.connect(), shopScout.connect(), secondhand.connect(), matcher.connect()]);

  const MAX_PRICE = 500_000;
  const proposals: { name: string; price: number; link: string; source: string; from: string }[] = [];

  // ── ShopScout: 브로드캐스트 감지 → 쿠팡+네이버 조회 ─────────────────────
  shopScout.on("broadcast", async (msg: HubMessage) => {
    const content = msg.content as { item?: string; maxPrice?: number };
    if (!JSON.stringify(content).toLowerCase().includes("iphone")) return;

    log("ShopScout", "RECEIVED", `iPhone 구매 요청 감지  maxPrice=${formatKrw(content.maxPrice ?? MAX_PRICE)}`);

    const res = await shopScout.data.searchShopping("아이폰15", content.maxPrice ?? MAX_PRICE);
    const products = (res.data as { products: { name: string; price: number; link: string; source: string }[] }).products ?? [];
    const affordable = products.filter((p) => p.price <= MAX_PRICE);

    log("ShopScout", "INFO", `${products.length}개 검색 결과 중 예산 내 ${affordable.length}개`);

    await sleep(300);
    if (affordable.length > 0) {
      const best = affordable.sort((a, b) => a.price - b.price)[0];
      shopScout.negotiate(msg.from, {
        type: "new_product",
        item: "iPhone 15",
        name: best.name,
        price: best.price,
        condition: "새제품",
        link: best.link,
        source: best.source,
        affiliateUrl: res.affiliate ?? best.link,
      });
      proposals.push({ name: best.name, price: best.price, link: best.link, source: "coupang/naver", from: shopScout["did"] });
    }
  });

  // ── SecondhandBot: 브로드캐스트 감지 → 중고 매물 조회 ──────────────────────
  secondhand.on("broadcast", async (msg: HubMessage) => {
    const content = msg.content as { item?: string };
    if (!JSON.stringify(content).toLowerCase().includes("iphone")) return;

    log("SecondhandBot", "RECEIVED", `중고 아이폰 요청 감지`);

    // 중고 시세 조회 (네이버 쇼핑 + 가격 분석)
    const [priceRes] = await Promise.all([
      secondhand.data.searchShopping("아이폰15 중고", MAX_PRICE),
    ]);
    const used = (priceRes.data as { products: { name: string; price: number; link: string }[] }).products ?? [];
    const usedAffordable = used.filter((p) => p.price <= MAX_PRICE && p.name.includes("중고"));

    await sleep(500);
    if (usedAffordable.length > 0) {
      const best = usedAffordable.sort((a, b) => a.price - b.price)[0];
      secondhand.negotiate(msg.from, {
        type: "used_product",
        item: "iPhone 15",
        name: best.name,
        price: best.price,
        condition: "중고 A급",
        link: best.link,
        source: "naver-smartstore",
      });
      proposals.push({ name: best.name, price: best.price, link: best.link, source: "naver-secondhand", from: secondhand["did"] });
    }
  });

  // ── PriceMatcher: 브로드캐스트 감지 → 시세 분석 후 요약 제공 ─────────────
  matcher.on("broadcast", async (msg: HubMessage) => {
    if (!JSON.stringify(msg.content).toLowerCase().includes("iphone")) return;

    log("PriceMatcher", "RECEIVED", `시세 분석 요청 감지`);
    const res = await matcher.data.searchShopping("iPhone15");
    const allPrices = (res.data as { products: { price: number }[] }).products?.map((p) => p.price).filter((p) => p > 0) ?? [];

    if (allPrices.length > 0) {
      const min = Math.min(...allPrices);
      const avg = Math.round(allPrices.reduce((a, b) => a + b, 0) / allPrices.length);
      await sleep(700);
      matcher.sendDirect(msg.from, "direct", {
        type: "price_analysis",
        item: "iPhone 15",
        minPrice: min,
        avgPrice: avg,
        sampleCount: allPrices.length,
        recommendation: min <= MAX_PRICE ? "구매 적기 — 최저가 예산 내" : `최저가 ${formatKrw(min)} — 예산 초과`,
      });
    }
  });

  // ── Buyer: negotiate 수신 → 가격 검증 ─────────────────────────────────────
  buyer.on("negotiate", (msg: HubMessage) => {
    const prop = msg.content as { name: string; price: number; condition: string; type: string };
    log("iPhoneBuyer", "RECEIVED", `제안: "${prop.name}"  ${formatKrw(prop.price)}  [${prop.condition}]`);
  });

  // ── Buyer: direct 수신 (시세 분석) ────────────────────────────────────────
  buyer.on("direct", (msg: HubMessage) => {
    const info = msg.content as { type?: string; minPrice?: number; avgPrice?: number; recommendation?: string };
    if (info.type === "price_analysis") {
      log("iPhoneBuyer", "INFO", `시세 분석: 최저 ${formatKrw(info.minPrice ?? 0)}  평균 ${formatKrw(info.avgPrice ?? 0)}`);
      log("iPhoneBuyer", "INFO", `추천: ${info.recommendation}`);
    }
  });

  // ── 워치리스트 등록 브로드캐스트 ──────────────────────────────────────────
  divider("워치리스트 등록 + 자율 협상 시작");
  buyer.broadcast({
    item: "iPhone15",
    maxPrice: MAX_PRICE,
    condition: "A급 이상",
    urgent: true,
    watchlist: true,
  });

  await sleep(3000);

  // ── 딜 확정: 최저가 선택 ──────────────────────────────────────────────────
  divider("최저가 딜 확정");
  const sorted = proposals.filter((p) => p.price <= MAX_PRICE).sort((a, b) => a.price - b.price);

  if (sorted.length > 0) {
    const winner = sorted[0];
    log("iPhoneBuyer", "INFO", `최저가 선택: "${winner.name}"  ${formatKrw(winner.price)}  [${winner.source}]`);

    const deal = buildDeal(
      `deal_iphone_${Date.now()}`,
      buyer["did"],
      winner.from,
      `${winner.name} ${formatKrw(winner.price)}`,
      winner,
      [winner.link]
    );

    buyer.accept(winner.from, deal.dealId, deal);

    // 나머지 제안 거절
    sorted.slice(1).forEach((p) => {
      buyer.reject(p.from, `offer_${p.from.slice(-8)}`, "더 저렴한 매물 선택");
    });

    log("iPhoneBuyer", "ONCHAIN", `deal_hash=${deal.dealHash.slice(0, 20)}…`);
    log("iPhoneBuyer", "DEAL",    `💰 쿠팡 파트너스 링크: ${deal.affiliateLinks[0]}`);
    log("iPhoneBuyer", "INFO",    `예산 ${formatKrw(MAX_PRICE)} → 절약 ${formatKrw(MAX_PRICE - winner.price)}`);
  } else {
    log("iPhoneBuyer", "INFO", `예산 내 매물 없음 — 워치리스트 유지`);
  }

  await sleep(500);
  [buyer, shopScout, secondhand, matcher].forEach((a) => a.disconnect());
  log("iPhoneBuyer", "INFO", "Scenario 2 완료 ✅");
}

export { main };
if (require.main === module) main().catch(console.error);
