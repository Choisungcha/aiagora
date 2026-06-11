import { Router, Request, Response } from "express";
import { getWeather } from "../providers/free/weather";
import { getAirQuality } from "../providers/free/airkorea";
import { getCached, setCache, buildCacheKey, wrapResponse } from "../cache/redis";
import { requireParams } from "../middleware/normalize";

const router = Router();

// GET /api/weather/current?location=서울
router.get(
  "/current",
  requireParams(["location"]),
  async (req: Request, res: Response): Promise<void> => {
    const location = String(req.query.location);
    const cacheKey = buildCacheKey("weather:current", { location });

    const cached = await getCached(cacheKey);
    if (cached) { res.json(cached); return; }

    try {
      const weather = await getWeather(location);
      const response = wrapResponse("kma", weather, null, 1800);
      await setCache(cacheKey, response, 1800);
      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Weather lookup failed";
      res.status(502).json({ error: "provider_error", message: msg });
    }
  }
);

// GET /api/weather/air?location=서울  → 에어코리아 실시간 대기질
router.get(
  "/air",
  requireParams(["location"]),
  async (req: Request, res: Response): Promise<void> => {
    const location = String(req.query.location);
    const cacheKey = buildCacheKey("weather:air", { location });

    const cached = await getCached(cacheKey);
    if (cached) { res.json(cached); return; }

    try {
      const air = await getAirQuality(location);
      const isMock = !process.env.PUBLIC_DATA_KEY;
      const response = wrapResponse(isMock ? "mock" : "airkorea", air, null, 600);
      await setCache(cacheKey, response, 600);
      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Air quality lookup failed";
      res.status(502).json({ error: "provider_error", message: msg });
    }
  }
);

export default router;
