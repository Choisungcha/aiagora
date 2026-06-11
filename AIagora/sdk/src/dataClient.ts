import * as http from "http";
import * as https from "https";
import { log } from "./logger";
import {
  GatewayResponse,
  ProductItem,
  FlightResult,
  HotelResult,
  PlaceResult,
  WeatherResult,
  ExchangeResult,
} from "./types";

// ── HTTP helper (no external deps) ────────────────────────────────────────────

function httpGet<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    const req = client.get(url, (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => (body += chunk.toString()));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body) as T);
        } catch {
          reject(new Error(`JSON parse error: ${body.slice(0, 100)}`));
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(8000, () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });
  });
}

// ── Mock data (fallback when gateway is unavailable) ──────────────────────────

const MOCK: Record<string, GatewayResponse> = {
  flights: {
    source: "skyscanner[mock]",
    affiliate: "https://skyscanner.com/aff?mock=1",
    cachedAt: Date.now(),
    ttl: 300,
    data: {
      count: 3,
      flights: [
        { airline: "대한항공 KE701", from: "ICN", to: "NRT", date: "2026-06-15", price: 185000, duration: "2h 45m", affiliateUrl: "https://skyscanner.com/aff?f=KE701" },
        { airline: "아시아나 OZ101", from: "ICN", to: "NRT", date: "2026-06-15", price: 192000, duration: "2h 50m", affiliateUrl: "https://skyscanner.com/aff?f=OZ101" },
        { airline: "진에어 LJ201",   from: "ICN", to: "NRT", date: "2026-06-15", price: 143000, duration: "2h 55m", affiliateUrl: "https://skyscanner.com/aff?f=LJ201" },
      ] as FlightResult[],
    },
  },
  hotels: {
    source: "agoda[mock]",
    affiliate: "https://agoda.com/aff?mock=1",
    cachedAt: Date.now(),
    ttl: 300,
    data: {
      count: 3,
      hotels: [
        { id: "htl_001", name: "도쿄 긴자 그랜드 호텔", location: "도쿄 긴자", pricePerNight: 145000, rating: 4.7, reviewCount: 2341, affiliateUrl: "https://agoda.com/htl_001" },
        { id: "htl_002", name: "신주쿠 프리미엄 스위트", location: "도쿄 신주쿠", pricePerNight: 118000, rating: 4.5, reviewCount: 1820, affiliateUrl: "https://agoda.com/htl_002" },
        { id: "htl_003", name: "아사쿠사 전통 료칸",    location: "도쿄 아사쿠사", pricePerNight:  98000, rating: 4.6, reviewCount: 983, affiliateUrl: "https://agoda.com/htl_003" },
      ] as HotelResult[],
    },
  },
  shopping: {
    source: "coupang+naver[mock]",
    affiliate: "https://coupang.com/vp/aff?mock=1",
    cachedAt: Date.now(),
    ttl: 300,
    data: {
      total: 4,
      products: [
        { id: "cp_001", name: "Apple 아이폰 15 128GB 블랙", price: 489000, imageUrl: "", link: "https://coupang.com/vp/cp_001", source: "coupang" },
        { id: "cp_002", name: "Apple 아이폰 15 256GB 블루", price: 498000, imageUrl: "", link: "https://coupang.com/vp/cp_002", source: "coupang" },
        { id: "nv_001", name: "[중고A급] iPhone15 128G",    price: 435000, imageUrl: "", link: "https://smartstore.naver.com/nv_001", source: "naver" },
        { id: "nv_002", name: "[중고S급] iPhone15 256G",    price: 465000, imageUrl: "", link: "https://smartstore.naver.com/nv_002", source: "naver" },
      ] as ProductItem[],
    },
  },
  food: {
    source: "kakao+naver[mock]",
    affiliate: null,
    cachedAt: Date.now(),
    ttl: 300,
    data: {
      count: 4,
      places: [
        { id: "kk_001", name: "스시 하루", address: "서울 마포구 합정동 123",    category: "일식 스시", phone: "02-123-4567", lat: 37.548, lng: 126.914 },
        { id: "kk_002", name: "파스타 빌라", address: "서울 마포구 서교동 456",  category: "양식 파스타", phone: "02-234-5678", lat: 37.551, lng: 126.921 },
        { id: "kk_003", name: "국밥집 원조", address: "서울 마포구 망원동 789",  category: "한식 국밥", phone: "02-345-6789", lat: 37.556, lng: 126.905 },
        { id: "kk_004", name: "라멘 사쿠라", address: "서울 마포구 연남동 321", category: "일식 라멘", phone: "02-456-7890", lat: 37.560, lng: 126.924 },
      ] as PlaceResult[],
    },
  },
  weather: {
    source: "kma[mock]",
    affiliate: null,
    cachedAt: Date.now(),
    ttl: 300,
    data: { location: "서울", temperature: 22, condition: "맑음", humidity: 55, windSpeed: 3.2 } as WeatherResult,
  },
  exchange: {
    source: "bok[mock]",
    affiliate: null,
    cachedAt: Date.now(),
    ttl: 3600,
    data: { currency: "JPY", rate: 8.92, unit: 100, date: "20260609" } as ExchangeResult,
  },
};

// ── DataClient ────────────────────────────────────────────────────────────────

export class DataClient {
  private readonly base: string;
  private readonly agentName: string;

  constructor(gatewayUrl: string, agentName: string) {
    this.base = gatewayUrl.replace(/\/$/, "");
    this.agentName = agentName;
  }

  private async call<T>(path: string, mockKey: string): Promise<GatewayResponse<T>> {
    const url = `${this.base}${path}`;
    log(this.agentName, "API CALL", `GET ${path}`);
    try {
      const result = await httpGet<GatewayResponse<T>>(url);
      const source = result.source ?? "gateway";
      log(this.agentName, "API RESP", `source=${source}  cached=${result.cachedAt > 0 ? "yes" : "no"}`);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      log(this.agentName, "API FAIL", `${path} — ${msg}  →  using mock data`);
      return MOCK[mockKey] as GatewayResponse<T>;
    }
  }

  async searchFlights(from: string, to: string, date: string): Promise<GatewayResponse<{ flights: FlightResult[] }>> {
    const p = encodeURIComponent;
    return this.call(`/api/travel/flights?from=${p(from)}&to=${p(to)}&date=${p(date)}`, "flights");
  }

  async searchHotels(location: string, checkin: string, budget: number): Promise<GatewayResponse<{ hotels: HotelResult[] }>> {
    const p = encodeURIComponent;
    return this.call(`/api/travel/hotels?location=${p(location)}&checkin=${p(checkin)}&budget=${budget}`, "hotels");
  }

  async searchShopping(q: string, budget?: number): Promise<GatewayResponse<{ products: ProductItem[] }>> {
    const p = encodeURIComponent;
    const budgetParam = budget ? `&budget=${budget}` : "";
    return this.call(`/api/shopping/search?q=${p(q)}${budgetParam}`, "shopping");
  }

  async searchFood(location: string, category: string): Promise<GatewayResponse<{ places: PlaceResult[] }>> {
    const p = encodeURIComponent;
    return this.call(`/api/food/search?location=${p(location)}&category=${p(category)}`, "food");
  }

  async getWeather(location: string): Promise<GatewayResponse<WeatherResult>> {
    return this.call(`/api/weather?location=${encodeURIComponent(location)}`, "weather");
  }

  async getExchangeRate(currency: string): Promise<GatewayResponse<ExchangeResult>> {
    return this.call(`/api/market/exchange?currency=${encodeURIComponent(currency)}`, "exchange");
  }
}
