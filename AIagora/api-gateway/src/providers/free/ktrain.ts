import axios from "axios";
import { TrainSchedule } from "../../types";

const TRAIN_URL =
  "https://apis.data.go.kr/1613000/TrainInfoService/getStrtpntAlocFndTrainInfo";

// 주요 역 코드 (한국철도공사 역코드)
const STATION_CODES: Record<string, string> = {
  서울: "NAY", 수서: "SUS", 용산: "YON", 광명: "GMG",
  천안아산: "CHO", 오송: "OSG", 대전: "DJN", 김천구미: "KCG",
  동대구: "DDG", 대구: "DGU", 경주: "KJS", 울산: "ULS",
  부산: "PUS", 광주송정: "GJS", 목포: "MKP", 전주: "JJU",
  여수엑스포: "YSE", 익산: "IKS", 마산: "MSN", 진주: "JIN",
  포항: "PHO", 강릉: "GRG", 청량리: "CRY",
};

function findStationCode(name: string): string {
  const key = Object.keys(STATION_CODES).find((k) => name.includes(k));
  return key ? STATION_CODES[key] : "NAY";
}

function todayDate(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
}

export async function searchTrains(
  from: string,
  to: string,
  date?: string
): Promise<TrainSchedule[]> {
  const key = process.env.PUBLIC_DATA_KEY;
  const depId = findStationCode(from);
  const arrId = findStationCode(to);
  const trainDate = date ?? todayDate();

  if (!key) return mockTrains(from, to, trainDate);

  const { data } = await axios.get(TRAIN_URL, {
    params: {
      serviceKey: key,
      numOfRows: 10,
      pageNo: 1,
      depPlaceId: depId,
      arrPlaceId: arrId,
      depPlandTime: trainDate,
      trainGradeCode: "00", // 00=전체, 100=KTX, 200=새마을
    },
    timeout: 8000,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = data?.response?.body?.items?.item ?? [];
  if (!Array.isArray(items) || items.length === 0) return mockTrains(from, to, trainDate);

  return items.map((item) => {
    const dep = String(item.depplandtime ?? "");
    const arr = String(item.arrplandtime ?? "");
    const depHHMM = dep.slice(8, 12);
    const arrHHMM = arr.slice(8, 12);
    const diffMin =
      (parseInt(arrHHMM.slice(0, 2)) * 60 + parseInt(arrHHMM.slice(2))) -
      (parseInt(depHHMM.slice(0, 2)) * 60 + parseInt(depHHMM.slice(2)));

    return {
      trainNo: String(item.trainno ?? ""),
      trainType: String(item.traingradename ?? "KTX"),
      depStation: from,
      arrStation: to,
      depTime: `${depHHMM.slice(0, 2)}:${depHHMM.slice(2)}`,
      arrTime: `${arrHHMM.slice(0, 2)}:${arrHHMM.slice(2)}`,
      duration: `${Math.floor(diffMin / 60)}h ${diffMin % 60}m`,
      seatAvail: String(item.seatattributecd ?? "일반석"),
    };
  });
}

function mockTrains(from: string, to: string, date: string): TrainSchedule[] {
  const formatted = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`;
  return [
    { trainNo: "101", trainType: "KTX", depStation: from, arrStation: to, depTime: "06:00", arrTime: "08:17", duration: "2h 17m", seatAvail: "일반실" },
    { trainNo: "103", trainType: "KTX", depStation: from, arrStation: to, depTime: "07:00", arrTime: "09:18", duration: "2h 18m", seatAvail: "일반실" },
    { trainNo: "105", trainType: "KTX", depStation: from, arrStation: to, depTime: "08:00", arrTime: "10:20", duration: "2h 20m", seatAvail: "매진" },
  ].map(t => ({ ...t }));
}
