import axios from "axios";
import { ExchangeResult } from "../../types";

// 한국은행 ECOS API — 외환/환율 통계 (731Y001: 원달러 환율 기준)
const BASE_URL = "https://ecos.bok.or.kr/api/StatisticSearch";

// Currency code mapping to BOK series codes
const CURRENCY_SERIES: Record<string, { code: string; unit: number }> = {
  USD: { code: "0000001", unit: 1 },   // 달러
  JPY: { code: "0000002", unit: 100 }, // 엔 (100엔 기준)
  EUR: { code: "0000003", unit: 1 },   // 유로
  CNY: { code: "0000004", unit: 1 },   // 위안
  GBP: { code: "0000005", unit: 1 },   // 파운드
};

function todayStr(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
}

export async function getExchangeRate(currency: string): Promise<ExchangeResult> {
  if (!process.env.BOK_API_KEY) {
    throw new Error("BOK_API_KEY not configured");
  }

  const upper = currency.toUpperCase();
  const series = CURRENCY_SERIES[upper] ?? CURRENCY_SERIES["USD"];
  const today = todayStr();
  // Request last 7 days range to handle weekends/holidays with no data
  const past7 = new Date(Date.now() - 7 * 86400_000);
  const pastStr = `${past7.getFullYear()}${String(past7.getMonth() + 1).padStart(2, "0")}${String(past7.getDate()).padStart(2, "0")}`;

  const url = `${BASE_URL}/${process.env.BOK_API_KEY}/json/kr/1/10/731Y001/DD/${pastStr}/${today}/${series.code}`;

  const { data } = await axios.get(url, { timeout: 6000 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = data?.StatisticSearch?.row ?? [];
  if (rows.length === 0) {
    throw new Error(`No exchange rate data found for ${upper}`);
  }

  const latest = rows[rows.length - 1];
  return {
    currency: upper,
    rate: parseFloat(latest.DATA_VALUE ?? "0"),
    unit: series.unit,
    date: latest.TIME ?? today,
  };
}
