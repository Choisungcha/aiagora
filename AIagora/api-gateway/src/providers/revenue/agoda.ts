import axios from "axios";
import * as crypto from "crypto";
import { HotelResult } from "../../types";

const BASE_URL = "https://api.agoda.com/affiliateservice/lt/v1";

function buildSignature(params: Record<string, string>): string {
  const apiKey = process.env.AGODA_API_KEY!;
  const siteId = process.env.AGODA_SITE_ID!;
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return crypto
    .createHmac("sha256", `${siteId}:${apiKey}`)
    .update(sorted)
    .digest("hex");
}

export async function searchHotels(
  location: string,
  checkIn: string,
  checkOut: string,
  budget: number,
  adults = 2
): Promise<HotelResult[]> {
  if (!process.env.AGODA_SITE_ID || !process.env.AGODA_API_KEY) {
    throw new Error("AGODA_SITE_ID / AGODA_API_KEY not configured");
  }

  const params: Record<string, string> = {
    siteId: process.env.AGODA_SITE_ID,
    cityName: location,
    checkIn,
    checkOut,
    adults: String(adults),
    maxPrice: String(budget),
    currency: "KRW",
    language: "ko",
  };

  const signature = buildSignature(params);

  const { data } = await axios.get(`${BASE_URL}/properties/search`, {
    params: { ...params, signature },
    headers: {
      "Content-Type": "application/json",
      "Accept-Language": "ko-KR",
    },
    timeout: 8000,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties: any[] = data?.result?.properties ?? [];

  return properties.slice(0, 10).map((p) => ({
    id: String(p.propertyId),
    name: p.propertyName,
    location: p.address?.fullAddress ?? location,
    pricePerNight: p.displayPrice?.perRoomPerNight ?? 0,
    rating: p.rating?.score ?? 0,
    reviewCount: p.rating?.reviewCount ?? 0,
    imageUrl: p.imageUrl ?? "",
    affiliateUrl: p.deepLink ?? "",
  }));
}
