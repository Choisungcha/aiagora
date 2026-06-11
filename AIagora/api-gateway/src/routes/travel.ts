import { Router, Request, Response } from "express";
import { searchFlights } from "../providers/revenue/skyscanner";
import { searchHotels } from "../providers/revenue/agoda";
import { searchTouristSpots, ContentType } from "../providers/free/tourapi";
import { getCached, setCache, buildCacheKey, wrapResponse } from "../cache/redis";
import { requireParams } from "../middleware/normalize";

const router = Router();

// GET /api/travel/flights?from=출발&to=도착&date=날짜
router.get(
  "/flights",
  requireParams(["from", "to", "date"]),
  async (req: Request, res: Response): Promise<void> => {
    const from = String(req.query.from);
    const to = String(req.query.to);
    const date = String(req.query.date);
    const adults = Number(req.query.adults ?? 1);

    const cacheKey = buildCacheKey("travel:flights", { from, to, date, adults });
    const cached = await getCached(cacheKey);
    if (cached) { res.json(cached); return; }

    try {
      const flights = await searchFlights(from, to, date, adults);
      const affiliate = flights[0]?.affiliateUrl ?? null;
      const response = wrapResponse(
        "skyscanner",
        { from, to, date, adults, count: flights.length, flights },
        affiliate
      );
      await setCache(cacheKey, response);
      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Flight search failed";
      res.status(502).json({ error: "provider_error", message: msg });
    }
  }
);

// GET /api/travel/hotels?location=장소&checkin=날짜&budget=금액
router.get(
  "/hotels",
  requireParams(["location", "checkin"]),
  async (req: Request, res: Response): Promise<void> => {
    const location = String(req.query.location);
    const checkIn = String(req.query.checkin);
    const checkOut = String(req.query.checkout ?? "");
    const budget = Number(req.query.budget ?? 500000);
    const adults = Number(req.query.adults ?? 2);

    const resolvedCheckOut =
      checkOut ||
      new Date(new Date(checkIn).getTime() + 86400_000).toISOString().slice(0, 10);

    const cacheKey = buildCacheKey("travel:hotels", {
      location, checkIn, checkOut: resolvedCheckOut, budget, adults,
    });
    const cached = await getCached(cacheKey);
    if (cached) { res.json(cached); return; }

    try {
      const hotels = await searchHotels(location, checkIn, resolvedCheckOut, budget, adults);
      const affiliate = hotels[0]?.affiliateUrl ?? null;
      const response = wrapResponse(
        "agoda",
        { location, checkIn, checkOut: resolvedCheckOut, budget, adults, count: hotels.length, hotels },
        affiliate
      );
      await setCache(cacheKey, response);
      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Hotel search failed";
      res.status(502).json({ error: "provider_error", message: msg });
    }
  }
);

// GET /api/travel/spots?keyword=경복궁&type=관광지
// 한국관광공사 TourAPI — 관광지/숙박/음식점/축제 검색
router.get(
  "/spots",
  requireParams(["keyword"]),
  async (req: Request, res: Response): Promise<void> => {
    const keyword = String(req.query.keyword);
    const type = (req.query.type as ContentType) ?? "관광지";
    const limit = Math.min(Number(req.query.limit ?? 10), 20);
    const cacheKey = buildCacheKey("travel:spots", { keyword, type });

    const cached = await getCached(cacheKey);
    if (cached) { res.json(cached); return; }

    try {
      const spots = await searchTouristSpots(keyword, type, limit);
      const isMock = !process.env.TOURAPI_KEY && !process.env.PUBLIC_DATA_KEY;
      const response = wrapResponse(
        isMock ? "mock" : "tourapi",
        { keyword, type, count: spots.length, spots },
        null,
        3600
      );
      await setCache(cacheKey, response, 3600);
      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Tourist spot search failed";
      res.status(502).json({ error: "provider_error", message: msg });
    }
  }
);

export default router;
