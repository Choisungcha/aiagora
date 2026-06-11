import axios from "axios";
import { SubwayArrival } from "../../types";

const SEOUL_SUBWAY_BASE = "http://swopenAPI.seoul.go.kr/api/subway";

export async function getSubwayArrivals(stationName: string): Promise<SubwayArrival[]> {
  const key = process.env.SEOUL_OPEN_API_KEY;
  if (!key) return mockArrivals(stationName);

  const url = `${SEOUL_SUBWAY_BASE}/${key}/json/realtimeStationArrival/0/5/${encodeURIComponent(stationName)}`;
  const { data } = await axios.get(url, { timeout: 5000 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list: any[] = data?.realtimeArrivalList ?? [];
  if (list.length === 0) return mockArrivals(stationName);

  return list.map((item) => ({
    stationName: item.statnNm ?? stationName,
    line: item.subwayId ?? "",
    direction: item.trainLineNm ?? "",
    message: item.arvlMsg2 ?? "",
    remainSeconds: Number(item.barvlDt) || 0,
  }));
}

function mockArrivals(stationName: string): SubwayArrival[] {
  return [
    {
      stationName,
      line: "2호선",
      direction: "외선순환 (강남방면)",
      message: "2분 후 도착",
      remainSeconds: 120,
    },
    {
      stationName,
      line: "2호선",
      direction: "내선순환 (홍대입구방면)",
      message: "5분 후 도착",
      remainSeconds: 300,
    },
  ];
}
