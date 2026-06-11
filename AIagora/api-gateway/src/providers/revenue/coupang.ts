import axios from "axios";
import * as crypto from "crypto";
import { ProductItem } from "../../types";

const BASE_URL = "https://api.partners.coupang.com";
const SEARCH_PATH = "/v2/providers/affiliate_open_api/apis/openapi/v1/products/search";

function buildAuthHeader(method: string, path: string): string {
  const accessKey = process.env.COUPANG_ACCESS_KEY!;
  const secretKey = process.env.COUPANG_SECRET_KEY!;
  const datetime = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

  const message = datetime + method + path;
  const signature = crypto
    .createHmac("sha256", secretKey)
    .update(message)
    .digest("hex");

  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;
}

export interface CoupangSearchResult {
  products: ProductItem[];
  affiliateLinks: string[];
}

export async function searchCoupang(
  keyword: string,
  limit = 10
): Promise<CoupangSearchResult> {
  if (!process.env.COUPANG_ACCESS_KEY || !process.env.COUPANG_SECRET_KEY) {
    throw new Error("COUPANG_ACCESS_KEY / COUPANG_SECRET_KEY not configured");
  }

  const query = `keyword=${encodeURIComponent(keyword)}&limit=${limit}&subId=hivagora`;
  const pathWithQuery = `${SEARCH_PATH}?${query}`;

  const { data } = await axios.get(`${BASE_URL}${pathWithQuery}`, {
    headers: {
      Authorization: buildAuthHeader("GET", pathWithQuery),
      "Content-Type": "application/json;charset=UTF-8",
    },
    timeout: 5000,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = data?.data?.productData ?? [];

  const products: ProductItem[] = items.map((item) => ({
    id: String(item.productId),
    name: item.productName,
    price: item.productPrice,
    imageUrl: item.productImage,
    link: item.affiliateUrl ?? item.productUrl,
    source: "coupang",
  }));

  return {
    products,
    affiliateLinks: products.map((p) => p.link),
  };
}
