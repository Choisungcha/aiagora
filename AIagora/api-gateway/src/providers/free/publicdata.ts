import axios from "axios";

// 공공데이터포털 — 범용 조회 helper
// 각 데이터셋은 개별 URL이 다르므로 generic fetch wrapper로 구현
const DEFAULT_TIMEOUT = 6000;

export interface PublicDataParams {
  serviceUrl: string;
  params: Record<string, string | number>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchPublicData(opts: PublicDataParams): Promise<any> {
  if (!process.env.PUBLIC_DATA_KEY) {
    throw new Error("PUBLIC_DATA_KEY not configured");
  }

  const { data } = await axios.get(opts.serviceUrl, {
    params: {
      serviceKey: process.env.PUBLIC_DATA_KEY,
      dataType: "JSON",
      ...opts.params,
    },
    timeout: DEFAULT_TIMEOUT,
  });

  return data?.response?.body ?? data;
}

// Holiday calendar — useful for agents scheduling meetings
export async function getHolidays(year: number, month: number) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return fetchPublicData({
    serviceUrl:
      "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo",
    params: {
      solYear: year,
      solMonth: pad(month),
      numOfRows: 31,
    },
  });
}
