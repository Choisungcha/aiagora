import axios from "axios";
import { CryptoTicker } from "../../types";

// 업비트 공개 API — 인증 불필요 (시세 조회)
const BASE = "https://api.upbit.com/v1";

const DEFAULT_MARKETS = ["KRW-BTC", "KRW-ETH", "KRW-XRP", "KRW-SOL", "KRW-ADA"];

const COIN_NAMES: Record<string, string> = {
  "KRW-BTC": "비트코인",
  "KRW-ETH": "이더리움",
  "KRW-XRP": "리플",
  "KRW-SOL": "솔라나",
  "KRW-ADA": "에이다",
  "KRW-DOGE": "도지코인",
  "KRW-MATIC": "폴리곤",
  "KRW-AVAX": "아발란체",
};

export async function getCryptoTickers(markets?: string[]): Promise<CryptoTicker[]> {
  const targetMarkets = markets ?? DEFAULT_MARKETS;

  try {
    const { data } = await axios.get(`${BASE}/ticker`, {
      params: { markets: targetMarkets.join(",") },
      timeout: 5000,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[]).map((item) => ({
      market: item.market,
      name: COIN_NAMES[item.market] ?? item.market.replace("KRW-", ""),
      price: item.trade_price,
      changeRate: parseFloat((item.signed_change_rate * 100).toFixed(2)),
      volume24h: Math.round(item.acc_trade_price_24h),
    }));
  } catch {
    return mockTickers(targetMarkets);
  }
}

function mockTickers(markets: string[]): CryptoTicker[] {
  const mockPrices: Record<string, number> = {
    "KRW-BTC": 98500000, "KRW-ETH": 5200000, "KRW-XRP": 850,
    "KRW-SOL": 240000, "KRW-ADA": 620,
  };
  return markets.map((m) => ({
    market: m,
    name: COIN_NAMES[m] ?? m.replace("KRW-", ""),
    price: mockPrices[m] ?? 10000,
    changeRate: parseFloat((Math.random() * 6 - 3).toFixed(2)),
    volume24h: Math.round(Math.random() * 1e12),
  }));
}
