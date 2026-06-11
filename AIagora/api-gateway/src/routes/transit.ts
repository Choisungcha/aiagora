import { Router, Request, Response } from "express";
import { getSubwayArrivals } from "../providers/free/subway";
import { searchTrains } from "../providers/free/ktrain";
import { getCached, setCache, buildCacheKey, wrapResponse } from "../cache/redis";
import { requireParams } from "../middleware/normalize";

const router = Router();

// GET /api/transit/subway?station=강남
// 서울 지하철 실시간 도착 (SEOUL_OPEN_API_KEY 없으면 mock)
router.get(
  "/subway",
  requireParams(["station"]),
  async (req: Request, res: Response): Promise<void> => {
    const station = String(req.query.station);
    const cacheKey = buildCacheKey("transit:subway", { station });

    const cached = await getCached(cacheKey);
    if (cached) { res.json(cached); return; }

    try {
      const arrivals = await getSubwayArrivals(station);
      const isMock = !process.env.SEOUL_OPEN_API_KEY;
      const response = wrapResponse(
        isMock ? "mock" : "seoul-subway",
        { station, count: arrivals.length, arrivals },
        null,
        30
      );
      await setCache(cacheKey, response, 30);
      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Subway arrival lookup failed";
      res.status(502).json({ error: "provider_error", message: msg });
    }
  }
);

// GET /api/transit/train?from=서울&to=부산&date=20260611
// 한국철도공사 KTX/새마을 시간표 (PUBLIC_DATA_KEY 없으면 mock)
router.get(
  "/train",
  requireParams(["from", "to"]),
  async (req: Request, res: Response): Promise<void> => {
    const from = String(req.query.from);
    const to = String(req.query.to);
    const date = req.query.date ? String(req.query.date).replace(/-/g, "") : undefined;
    const cacheKey = buildCacheKey("transit:train", { from, to, date: date ?? "today" });

    const cached = await getCached(cacheKey);
    if (cached) { res.json(cached); return; }

    try {
      const trains = await searchTrains(from, to, date);
      const isMock = !process.env.PUBLIC_DATA_KEY;
      const response = wrapResponse(
        isMock ? "mock" : "korail",
        { from, to, date, count: trains.length, trains },
        null,
        600
      );
      await setCache(cacheKey, response, 600);
      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Train search failed";
      res.status(502).json({ error: "provider_error", message: msg });
    }
  }
);

export default router;
