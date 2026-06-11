import axios from "axios";
import { DartDisclosure } from "../../types";

const BASE = "https://opendart.fss.or.kr/api";

export async function searchDartDisclosures(
  companyName: string,
  limit = 10
): Promise<DartDisclosure[]> {
  const key = process.env.DART_API_KEY;
  if (!key) return mockDisclosures(companyName);

  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const endDate = `${today.getFullYear()}${pad(today.getMonth() + 1)}${pad(today.getDate())}`;
  const startDate = `${today.getFullYear() - 1}${pad(today.getMonth() + 1)}${pad(today.getDate())}`;

  const { data } = await axios.get(`${BASE}/list.json`, {
    params: {
      crtfc_key: key,
      corp_name: companyName,
      bgn_de: startDate,
      end_de: endDate,
      page_no: 1,
      page_count: limit,
      sort: "date",
      sort_mth: "desc",
    },
    timeout: 6000,
  });

  if (data?.status !== "000") return mockDisclosures(companyName);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = data?.list ?? [];
  return items.map((item) => ({
    corpName: item.corp_name ?? companyName,
    disclosureTitle: item.report_nm ?? "",
    disclosureDate: item.rcept_dt ?? "",
    reportType: item.rm ?? "",
    link: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${item.rcept_no}`,
  }));
}

function mockDisclosures(companyName: string): DartDisclosure[] {
  return [
    {
      corpName: companyName,
      disclosureTitle: `${companyName} 분기보고서 (2026.1Q)`,
      disclosureDate: "20260514",
      reportType: "Q",
      link: "https://dart.fss.or.kr",
    },
    {
      corpName: companyName,
      disclosureTitle: `${companyName} 사업보고서 (2025년)`,
      disclosureDate: "20260331",
      reportType: "A",
      link: "https://dart.fss.or.kr",
    },
  ];
}
