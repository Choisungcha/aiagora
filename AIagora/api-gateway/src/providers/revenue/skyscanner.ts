import axios from "axios";
import { FlightResult } from "../../types";

// Skyscanner Flights Live Search API (RapidAPI-hosted affiliate version)
const BASE_URL = "https://skyscanner50.p.rapidapi.com/api/v1";

export async function searchFlights(
  from: string,
  to: string,
  date: string,
  adults = 1
): Promise<FlightResult[]> {
  if (!process.env.SKYSCANNER_API_KEY) {
    throw new Error("SKYSCANNER_API_KEY not configured");
  }

  // Step 1: Create search session
  const createRes = await axios.post(
    `${BASE_URL}/flights/search`,
    {
      origin: from,
      destination: to,
      date,
      adults: String(adults),
      cabinClass: "economy",
      currency: "KRW",
    },
    {
      headers: {
        "x-rapidapi-key": process.env.SKYSCANNER_API_KEY,
        "x-rapidapi-host": "skyscanner50.p.rapidapi.com",
        "Content-Type": "application/json",
      },
      timeout: 8000,
    }
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const itineraries: any[] = createRes.data?.data?.itineraries ?? [];

  return itineraries.slice(0, 10).map((item) => ({
    from,
    to,
    date,
    price: item.price?.amount ?? 0,
    airline: item.legs?.[0]?.carriers?.marketing?.[0]?.name ?? "Unknown",
    duration: formatDuration(item.legs?.[0]?.durationInMinutes ?? 0),
    affiliateUrl: item.deepLink ?? "",
  }));
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}
