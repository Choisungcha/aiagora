import axios from "axios";
import { ProductItem } from "../../types";

export interface DanawaResult {
  keyword: string;
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
  products: ProductItem[];
}

// 다나와 공식 API 없음 → Naver 쇼핑 API로 최저가 비교 (키 있을 때)
// 키 없을 때: 키워드 기반 현실적 mock
export async function searchDanawa(keyword: string, limit = 10): Promise<DanawaResult> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (clientId && clientSecret) {
    const { data } = await axios.get("https://openapi.naver.com/v1/search/shop.json", {
      params: { query: keyword, display: limit, sort: "asc" },
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
      timeout: 5000,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = data?.items ?? [];
    const products: ProductItem[] = items.map((item) => ({
      id: String(item.productId ?? Math.random()),
      name: item.title.replace(/<[^>]+>/g, ""),
      price: Number(item.lprice) || 0,
      imageUrl: item.image ?? "",
      link: item.link ?? "",
      source: "danawa",
    }));

    const prices = products.map((p) => p.price).filter((p) => p > 0);
    return {
      keyword,
      minPrice: prices.length ? Math.min(...prices) : 0,
      maxPrice: prices.length ? Math.max(...prices) : 0,
      avgPrice: prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0,
      products,
    };
  }

  // Mock fallback
  const base = keyword.includes("아이폰") ? 480000
    : keyword.includes("갤럭시") ? 360000
    : keyword.includes("맥북") ? 1100000
    : 200000;

  const labels = ["최저가 (해외직구)", "국내 최저가", "공식몰 기준가"];
  const mockProducts: ProductItem[] = labels.map((label, i) => ({
    id: `danawa-${i}`,
    name: `${keyword} ${label}`,
    price: Math.round((base * (0.85 + i * 0.1)) / 1000) * 1000,
    imageUrl: "",
    link: `https://www.danawa.com/product/?search_keyword=${encodeURIComponent(keyword)}`,
    source: "danawa",
  }));

  const prices = mockProducts.map((p) => p.price);
  return {
    keyword,
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
    avgPrice: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
    products: mockProducts,
  };
}
