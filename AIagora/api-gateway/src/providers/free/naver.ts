import axios from "axios";
import { ProductItem, PlaceResult, NewsItem } from "../../types";

const BASE = "https://openapi.naver.com/v1";

function naverHeaders() {
  return {
    "X-Naver-Client-Id": process.env.NAVER_CLIENT_ID ?? "",
    "X-Naver-Client-Secret": process.env.NAVER_CLIENT_SECRET ?? "",
  };
}

function requireNaverKeys() {
  if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET) {
    throw new Error("NAVER_CLIENT_ID / NAVER_CLIENT_SECRET not configured");
  }
}

export async function naverShoppingSearch(
  keyword: string,
  limit = 10
): Promise<ProductItem[]> {
  requireNaverKeys();
  const { data } = await axios.get(`${BASE}/search/shop.json`, {
    headers: naverHeaders(),
    params: { query: keyword, display: limit, sort: "sim" },
    timeout: 5000,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data.items ?? []).map((item: any) => ({
    id: item.productId ?? String(Math.random()),
    name: item.title.replace(/<[^>]+>/g, ""),
    price: parseInt(item.lprice ?? "0", 10),
    imageUrl: item.image ?? "",
    link: item.link,
    source: "naver",
  }));
}

export async function naverLocalSearch(
  query: string,
  limit = 10
): Promise<PlaceResult[]> {
  requireNaverKeys();
  const { data } = await axios.get(`${BASE}/search/local.json`, {
    headers: naverHeaders(),
    params: { query, display: limit, sort: "comment" },
    timeout: 5000,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data.items ?? []).map((item: any) => ({
    id: item.link?.split("id=")[1] ?? String(Math.random()),
    name: item.title.replace(/<[^>]+>/g, ""),
    address: item.address ?? item.roadAddress ?? "",
    category: item.category ?? "",
    phone: item.telephone ?? "",
    rating: 0,
    reviewCount: 0,
    lat: parseFloat(item.mapy ?? "0") / 1e7,
    lng: parseFloat(item.mapx ?? "0") / 1e7,
  }));
}

export async function naverNewsSearch(
  keyword: string,
  limit = 10
): Promise<NewsItem[]> {
  requireNaverKeys();
  const { data } = await axios.get(`${BASE}/search/news.json`, {
    headers: naverHeaders(),
    params: { query: keyword, display: limit, sort: "date" },
    timeout: 5000,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data.items ?? []).map((item: any) => ({
    title: item.title.replace(/<[^>]+>/g, ""),
    description: item.description.replace(/<[^>]+>/g, ""),
    link: item.link,
    publishedAt: item.pubDate,
    source: "naver",
  }));
}
