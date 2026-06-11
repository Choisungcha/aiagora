import axios from "axios";
import { ApartmentTransaction } from "../../types";

const APT_TRADE_URL =
  "https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev";

// 주요 시군구 법정동코드 앞 5자리
const LAWD_CODES: Record<string, string> = {
  강남구: "11680", 서초구: "11650", 마포구: "11440", 영등포구: "11560",
  송파구: "11710", 노원구: "11350", 강서구: "11500", 관악구: "11620",
  서울: "11110", 부산: "21110", 대구: "22110", 인천: "23110",
  광주: "24110", 대전: "25110", 수원: "41110", 성남: "41130",
  고양: "41280", 용인: "41460", 판교: "41130",
};

function findLawdCode(location: string): string {
  const key = Object.keys(LAWD_CODES).find((k) => location.includes(k));
  return key ? LAWD_CODES[key] : "11680"; // 강남구 기본값
}

function currentYearMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}${m}`;
}

export async function getAptTransactions(
  location: string,
  yearMonth?: string
): Promise<ApartmentTransaction[]> {
  const key = process.env.PUBLIC_DATA_KEY;
  const lawdCd = findLawdCode(location);
  const dealYmd = yearMonth ?? currentYearMonth();

  if (!key) return mockTransactions(location);

  const { data } = await axios.get(APT_TRADE_URL, {
    params: {
      serviceKey: key,
      pageNo: 1,
      numOfRows: 10,
      LAWD_CD: lawdCd,
      DEAL_YMD: dealYmd,
    },
    timeout: 8000,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = data?.response?.body?.items?.item ?? [];
  if (!Array.isArray(items)) return mockTransactions(location);

  return items.map((item) => ({
    aptName: String(item["아파트"] ?? "").trim(),
    area: parseFloat(item["전용면적"] ?? "0"),
    floor: Number(item["층"] ?? 0),
    dealAmount: Number(String(item["거래금액"] ?? "0").replace(/,/g, "")),
    dealYear: Number(item["년"] ?? 0),
    dealMonth: Number(item["월"] ?? 0),
    dealDay: Number(item["일"] ?? 0),
    dong: String(item["법정동"] ?? "").trim(),
    buildYear: Number(item["건축년도"] ?? 0),
  }));
}

function mockTransactions(location: string): ApartmentTransaction[] {
  return [
    {
      aptName: `${location} 대표 아파트`,
      area: 84.9,
      floor: 12,
      dealAmount: 95000,
      dealYear: 2026,
      dealMonth: 5,
      dealDay: 15,
      dong: location,
      buildYear: 2010,
    },
    {
      aptName: `${location} 신축 아파트`,
      area: 59.8,
      floor: 7,
      dealAmount: 72000,
      dealYear: 2026,
      dealMonth: 5,
      dealDay: 22,
      dong: location,
      buildYear: 2021,
    },
  ];
}
