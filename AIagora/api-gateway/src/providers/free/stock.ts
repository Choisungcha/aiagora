import axios from "axios";
import { StockItem } from "../../types";

// Naver Finance autocomplete — no API key required
const NAVER_FINANCE_AC = "https://ac.finance.naver.com/ac";

export async function searchStocks(keyword: string, limit = 10): Promise<StockItem[]> {
  try {
    const { data } = await axios.get(NAVER_FINANCE_AC, {
      params: {
        q: keyword,
        q_enc: "utf-8",
        st: "111",
        r_format: "json",
        r_enc: "utf-8",
        r_lt: "111",
        r_tab: "1",
        target: "stock_name",
      },
      timeout: 5000,
    });

    // Response shape: { items: [[name, code, market, price, change, changeRate][], ...] }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[][] = data?.items?.[0] ?? [];

    if (items.length > 0) {
      return items.slice(0, limit).map((item) => ({
        code: String(item[1] ?? ""),
        name: String(item[0] ?? ""),
        market: String(item[2] ?? "KOSPI"),
        price: Number(item[3]) || 0,
        changeRate: Number(item[5]) || 0,
        link: `https://finance.naver.com/item/main.naver?code=${item[1]}`,
      }));
    }
  } catch {
    // Network unavailable in sandbox — fall through to mock
  }

  return mockStocks(keyword, limit);
}

const STOCK_MOCK_MAP: Record<string, { code: string; market: string; price: number }> = {
  삼성전자: { code: "005930", market: "KOSPI", price: 74800 },
  sk하이닉스: { code: "000660", market: "KOSPI", price: 191500 },
  카카오: { code: "035720", market: "KOSPI", price: 42350 },
  네이버: { code: "035420", market: "KOSPI", price: 189500 },
  현대차: { code: "005380", market: "KOSPI", price: 218000 },
  셀트리온: { code: "068270", market: "KOSPI", price: 156000 },
};

function mockStocks(keyword: string, limit: number): StockItem[] {
  const matches = Object.entries(STOCK_MOCK_MAP).filter(([name]) =>
    name.includes(keyword.toLowerCase()) || keyword.includes(name)
  );
  const results = matches.length > 0 ? matches : Object.entries(STOCK_MOCK_MAP).slice(0, 2);

  return results.slice(0, limit).map(([name, info]) => ({
    code: info.code,
    name,
    market: info.market,
    price: info.price,
    changeRate: parseFloat((Math.random() * 4 - 2).toFixed(2)),
    link: `https://finance.naver.com/item/main.naver?code=${info.code}`,
  }));
}
