import axios from "axios";
import { TouristSpot } from "../../types";

const BASE = "https://apis.data.go.kr/B551011/KorService1/searchKeyword1";

// contentTypeId: 12=관광지, 14=문화시설, 15=축제행사, 32=숙박, 38=쇼핑, 39=음식점
export type ContentType = "관광지" | "문화시설" | "축제" | "숙박" | "쇼핑" | "음식점";

const CONTENT_TYPE_ID: Record<ContentType, string> = {
  관광지: "12",
  문화시설: "14",
  축제: "15",
  숙박: "32",
  쇼핑: "38",
  음식점: "39",
};

export async function searchTouristSpots(
  keyword: string,
  type: ContentType = "관광지",
  limit = 10
): Promise<TouristSpot[]> {
  const key = process.env.TOURAPI_KEY ?? process.env.PUBLIC_DATA_KEY;
  if (!key) return mockSpots(keyword, type);

  const { data } = await axios.get(BASE, {
    params: {
      serviceKey: key,
      numOfRows: limit,
      pageNo: 1,
      MobileOS: "ETC",
      MobileApp: "hivagora",
      _type: "json",
      keyword,
      contentTypeId: CONTENT_TYPE_ID[type],
    },
    timeout: 6000,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = data?.response?.body?.items?.item ?? [];
  if (!Array.isArray(items)) return mockSpots(keyword, type);

  return items.map((item) => ({
    id: String(item.contentid ?? ""),
    title: String(item.title ?? ""),
    address: String(item.addr1 ?? "") + (item.addr2 ? ` ${item.addr2}` : ""),
    category: type,
    imageUrl: String(item.firstimage ?? ""),
    overview: String(item.overview ?? ""),
    mapX: Number(item.mapx) || 0,
    mapY: Number(item.mapy) || 0,
  }));
}

function mockSpots(keyword: string, type: ContentType): TouristSpot[] {
  const examples: Record<ContentType, string[]> = {
    관광지: ["경복궁", "남산서울타워", "북촌한옥마을"],
    문화시설: ["국립중앙박물관", "국립현대미술관"],
    축제: ["서울빛초롱축제", "보령머드축제"],
    숙박: ["롯데호텔서울", "신라호텔"],
    쇼핑: ["명동", "동대문디자인플라자"],
    음식점: ["광장시장", "통인시장"],
  };
  return (examples[type] ?? [keyword]).slice(0, 3).map((name, i) => ({
    id: `mock-${i}`,
    title: name,
    address: `서울 ${keyword}`,
    category: type,
    imageUrl: "",
    overview: `${name} 관련 ${type} 정보`,
    mapX: 126.97 + i * 0.01,
    mapY: 37.57 + i * 0.01,
  }));
}
