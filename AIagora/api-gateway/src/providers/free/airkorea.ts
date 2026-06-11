import axios from "axios";
import { AirQualityResult } from "../../types";

const BASE = "https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty";

const GRADE_MAP: Record<string, string> = {
  "1": "좋음", "2": "보통", "3": "나쁨", "4": "매우나쁨",
};

// 시도명 정규화 (서울 → 서울, 부산시 → 부산)
function normalizeSido(location: string): string {
  const map: Record<string, string> = {
    서울: "서울", 부산: "부산", 대구: "대구", 인천: "인천",
    광주: "광주", 대전: "대전", 울산: "울산", 세종: "세종",
    경기: "경기", 강원: "강원", 충북: "충북", 충남: "충남",
    전북: "전북", 전남: "전남", 경북: "경북", 경남: "경남", 제주: "제주",
  };
  const key = Object.keys(map).find((k) => location.includes(k));
  return key ? map[key] : "서울";
}

export async function getAirQuality(location: string): Promise<AirQualityResult> {
  const key = process.env.PUBLIC_DATA_KEY;
  const sido = normalizeSido(location);

  if (!key) return mockAirQuality(location);

  const { data } = await axios.get(BASE, {
    params: {
      serviceKey: key,
      returnType: "json",
      numOfRows: 1,
      pageNo: 1,
      sidoName: sido,
      ver: "1.0",
    },
    timeout: 6000,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const item: any = data?.response?.body?.items?.[0] ?? {};

  const pm10 = Number(item.pm10Value) || 0;
  const grade = gradeFromPm10(pm10);

  return {
    location: item.stationName ? `${sido} ${item.stationName}` : sido,
    pm10,
    pm25: Number(item.pm25Value) || 0,
    o3: Number(item.o3Value) || 0,
    no2: Number(item.no2Value) || 0,
    grade: GRADE_MAP[item.pm10Grade ?? ""] ?? grade,
    measuredAt: item.dataTime ?? new Date().toISOString(),
  };
}

function gradeFromPm10(pm10: number): string {
  if (pm10 <= 30) return "좋음";
  if (pm10 <= 80) return "보통";
  if (pm10 <= 150) return "나쁨";
  return "매우나쁨";
}

function mockAirQuality(location: string): AirQualityResult {
  return {
    location,
    pm10: 32,
    pm25: 15,
    o3: 0.031,
    no2: 0.021,
    grade: "보통",
    measuredAt: new Date().toISOString(),
  };
}
