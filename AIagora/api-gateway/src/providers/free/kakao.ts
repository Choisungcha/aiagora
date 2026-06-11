import axios from "axios";
import { PlaceResult } from "../../types";

const BASE = "https://dapi.kakao.com/v2/local";

function kakaoHeaders() {
  return { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY ?? ""}` };
}

export async function kakaoPlaceSearch(
  keyword: string,
  category_group_code = "", // e.g. "FD6" for 음식점, "CE7" for 카페
  limit = 10
): Promise<PlaceResult[]> {
  if (!process.env.KAKAO_REST_API_KEY) {
    throw new Error("KAKAO_REST_API_KEY not configured");
  }

  const params: Record<string, string | number> = {
    query: keyword,
    size: limit,
  };
  if (category_group_code) params.category_group_code = category_group_code;

  const { data } = await axios.get(`${BASE}/search/keyword.json`, {
    headers: kakaoHeaders(),
    params,
    timeout: 5000,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data.documents ?? []).map((doc: any) => ({
    id: doc.id,
    name: doc.place_name,
    address: doc.road_address_name || doc.address_name,
    category: doc.category_name,
    phone: doc.phone,
    rating: 0,
    reviewCount: 0,
    lat: parseFloat(doc.y),
    lng: parseFloat(doc.x),
  }));
}
