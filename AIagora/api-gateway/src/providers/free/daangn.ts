import { ProductItem } from "../../types";

// 당근마켓 공식 공개 API 없음 → 키워드 분석 기반 현실적 mock
const DAANGN_SEARCH = "https://www.daangn.com/search";

const PRICE_MAP: Record<string, number> = {
  아이폰: 420000,
  갤럭시: 320000,
  맥북: 950000,
  아이패드: 480000,
  자전거: 180000,
  킥보드: 120000,
  노트북: 600000,
  카메라: 350000,
  가방: 80000,
  운동화: 60000,
};

const CONDITIONS = ["상태 최상 직거래 우선", "거의 새것 택배가능", "사용감 있음 가격협의"];

function estimateBasePrice(keyword: string): number {
  for (const [token, price] of Object.entries(PRICE_MAP)) {
    if (keyword.includes(token)) return price;
  }
  return 50000;
}

export async function searchDaangn(keyword: string, limit = 6): Promise<ProductItem[]> {
  const base = estimateBasePrice(keyword);
  const count = Math.min(limit, CONDITIONS.length * 2);

  return Array.from({ length: count }, (_, i) => {
    const ratio = 0.65 + (i / count) * 0.45;
    const price = Math.round((base * ratio) / 1000) * 1000;
    return {
      id: `daangn-${i}`,
      name: `[당근] ${keyword} (${CONDITIONS[i % CONDITIONS.length]})`,
      price,
      imageUrl: "",
      link: `${DAANGN_SEARCH}?q=${encodeURIComponent(keyword)}`,
      source: "daangn",
    };
  });
}
