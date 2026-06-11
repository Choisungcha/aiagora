import axios from "axios";
import { GasStationPrice } from "../../types";

// OPINET 전국 평균 주유가격 (한국석유공사)
const BASE = "https://www.opinet.co.kr/api";

const REGION_CODES: Record<string, string> = {
  서울: "01", 부산: "02", 대구: "03", 인천: "04", 광주: "05",
  대전: "06", 울산: "07", 세종: "08", 경기: "09", 강원: "10",
  충북: "11", 충남: "12", 전북: "13", 전남: "14", 경북: "15",
  경남: "16", 제주: "17",
};

function findRegionCode(location: string): string {
  const key = Object.keys(REGION_CODES).find((k) => location.includes(k));
  return key ? REGION_CODES[key] : "01";
}

export async function getGasPrices(location = "전국"): Promise<GasStationPrice> {
  const apiKey = process.env.OPINET_API_KEY;
  if (!apiKey) return mockGasPrices(location);

  const sido = findRegionCode(location);

  // 지역 평균가 조회
  const { data } = await axios.get(`${BASE}/avgSidoPrice.do`, {
    params: { code: apiKey, out: "json", sido },
    timeout: 5000,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = data?.RESULT?.OIL ?? [];

  const find = (prodcd: string) =>
    Number(items.find((i) => i.PRODCD === prodcd)?.PRICE ?? 0);

  return {
    region: location,
    gasoline: find("B027"),  // 휘발유
    diesel: find("D047"),    // 경유
    lpg: find("K015"),       // LPG
    updatedAt: new Date().toISOString(),
  };
}

export async function getCheapestStations(
  lat: number,
  lng: number,
  radius = 2000
): Promise<Array<{ name: string; address: string; gasoline: number; diesel: number }>> {
  const apiKey = process.env.OPINET_API_KEY;
  if (!apiKey) return mockCheapStations();

  const { data } = await axios.get(`${BASE}/nearLowPriceList.do`, {
    params: { code: apiKey, out: "json", x: lng, y: lat, radius, prodcd: "B027", sort: "price" },
    timeout: 5000,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = data?.RESULT?.OIL ?? [];
  return items.slice(0, 5).map((item) => ({
    name: item.OS_NM ?? "",
    address: item.ADDR ?? "",
    gasoline: Number(item.PRICE) || 0,
    diesel: 0,
  }));
}

function mockGasPrices(location: string): GasStationPrice {
  return {
    region: location,
    gasoline: 1698,
    diesel: 1549,
    lpg: 1034,
    updatedAt: new Date().toISOString(),
  };
}

function mockCheapStations() {
  return [
    { name: "셀프주유소 강남점", address: "서울 강남구 테헤란로 123", gasoline: 1628, diesel: 1489 },
    { name: "GS칼텍스 서초점", address: "서울 서초구 반포대로 56", gasoline: 1645, diesel: 1510 },
  ];
}
