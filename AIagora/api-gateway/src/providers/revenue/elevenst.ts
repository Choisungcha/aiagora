import axios from "axios";
import { ProductItem } from "../../types";

const BASE_URL = "https://openapi.11st.co.kr/openapi/OpenApiService.tvRestService";

export async function searchElevenst(
  keyword: string,
  limit = 10
): Promise<ProductItem[]> {
  if (!process.env.ELEVENST_APP_KEY) {
    throw new Error("ELEVENST_APP_KEY not configured");
  }

  const { data } = await axios.get(`${BASE_URL}/searchProductList`, {
    params: {
      key: process.env.ELEVENST_APP_KEY,
      keyword,
      pageSize: limit,
      sortCd: "2", // sort by price ascending
      dispCtgrNo: "",
    },
    headers: { Accept: "application/json" },
    timeout: 5000,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] =
    data?.ProductSearchResponse?.ProductList?.Product ?? [];

  return items.map((item) => ({
    id: String(item.productCode),
    name: item.productName,
    price: parseInt(item.productPrice ?? "0", 10),
    imageUrl: item.productImage ?? "",
    link: item.productDetailUrl ?? "",
    source: "11st",
  }));
}
