import axios from "axios";
import { WeatherResult } from "../../types";

// 기상청 단기예보 API (공공데이터포털)
const BASE_URL = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst";

// Simplified grid coordinates for major cities
const CITY_GRID: Record<string, { nx: number; ny: number }> = {
  서울: { nx: 60, ny: 127 },
  부산: { nx: 98, ny: 76 },
  인천: { nx: 55, ny: 124 },
  대구: { nx: 89, ny: 90 },
  대전: { nx: 67, ny: 100 },
  광주: { nx: 58, ny: 74 },
  수원: { nx: 60, ny: 121 },
  제주: { nx: 52, ny: 38 },
  강릉: { nx: 92, ny: 131 },
  춘천: { nx: 73, ny: 134 },
  default: { nx: 60, ny: 127 }, // Seoul fallback
};

function getGrid(location: string) {
  const key = Object.keys(CITY_GRID).find((k) => location.includes(k));
  return key ? CITY_GRID[key] : CITY_GRID["default"];
}

function getBaseDateTime(): { baseDate: string; baseTime: string } {
  const now = new Date();
  // Ultra-short term observation rounds to the last 30-min mark
  const minutes = now.getMinutes() >= 30 ? 30 : 0;
  now.setMinutes(minutes, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  const baseDate = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const baseTime = `${pad(now.getHours())}${pad(now.getMinutes())}`;
  return { baseDate, baseTime };
}

export async function getWeather(location: string): Promise<WeatherResult> {
  if (!process.env.WEATHER_API_KEY) {
    throw new Error("WEATHER_API_KEY not configured");
  }

  const grid = getGrid(location);
  const { baseDate, baseTime } = getBaseDateTime();

  const { data } = await axios.get(BASE_URL, {
    params: {
      serviceKey: process.env.WEATHER_API_KEY,
      pageNo: 1,
      numOfRows: 10,
      dataType: "JSON",
      base_date: baseDate,
      base_time: baseTime,
      nx: grid.nx,
      ny: grid.ny,
    },
    timeout: 6000,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = data?.response?.body?.items?.item ?? [];
  const get = (cat: string) =>
    parseFloat(items.find((i) => i.category === cat)?.obsrValue ?? "0");

  // Category codes: T1H=기온, REH=습도, WSD=풍속, RN1=1시간강수량, PTY=강수형태
  const condition = interpretPty(get("PTY"));

  return {
    location,
    temperature: get("T1H"),
    condition,
    humidity: get("REH"),
    windSpeed: get("WSD"),
    precipitation: get("RN1"),
    observedAt: `${baseDate.slice(0, 4)}-${baseDate.slice(4, 6)}-${baseDate.slice(6)} ${baseTime.slice(0, 2)}:${baseTime.slice(2)}`,
  };
}

function interpretPty(code: number): string {
  const map: Record<number, string> = {
    0: "맑음",
    1: "비",
    2: "비/눈",
    3: "눈",
    5: "빗방울",
    6: "빗방울눈날림",
    7: "눈날림",
  };
  return map[code] ?? "맑음";
}
