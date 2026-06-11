import axios from "axios";
import { DeliveryStatus, DeliveryEvent } from "../../types";

const CARRIER_NAMES: Record<string, string> = {
  "04": "CJ대한통운",
  "05": "한진택배",
  "06": "롯데글로벌로지스",
  "08": "우체국택배",
  "11": "로젠택배",
  "23": "경동택배",
};

export async function trackDelivery(
  trackingNumber: string,
  carrierId = "04"
): Promise<DeliveryStatus> {
  const apiKey = process.env.SWEETTRACKER_API_KEY;
  const carrierName = CARRIER_NAMES[carrierId] ?? carrierId;

  if (apiKey) {
    const { data } = await axios.get("https://info.sweettracker.co.kr/api/v1/trackingInfo", {
      params: { t_key: apiKey, t_code: carrierId, t_invoice: trackingNumber },
      timeout: 5000,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const details: any[] = data?.trackingDetails ?? [];
    const history: DeliveryEvent[] = details.map((h) => ({
      time: h.timeString ?? "",
      location: h.where ?? "",
      status: h.kind ?? "",
    }));

    return {
      trackingNumber,
      carrier: data?.companyName ?? carrierName,
      status: data?.level ?? "배송중",
      location: history[0]?.location ?? "",
      timestamp: history[0]?.time ?? new Date().toISOString(),
      history,
    };
  }

  // Realistic mock (SWEETTRACKER_API_KEY 미설정 시)
  const now = Date.now();
  return {
    trackingNumber,
    carrier: carrierName,
    status: "배송중",
    location: "서울 강남 물류센터",
    timestamp: new Date(now).toISOString(),
    history: [
      { time: new Date(now - 3_600_000).toISOString(), location: "서울 강남 물류센터", status: "배송출발" },
      { time: new Date(now - 14_400_000).toISOString(), location: "인천 허브터미널", status: "간선상차" },
      { time: new Date(now - 28_800_000).toISOString(), location: "부산 물류센터", status: "집화완료" },
    ],
  };
}
