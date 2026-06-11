import { Router, Request, Response } from "express";
import { getAptTransactions } from "../providers/free/realestate";
import { getCached, setCache, buildCacheKey, wrapResponse } from "../cache/redis";
import { requireParams } from "../middleware/normalize";

const router = Router();

// GET /api/realestate/apt?location=강남구&ym=202605
// ym: 년월 (YYYYMM, 기본값: 이번 달)
router.get(
  "/apt",
  requireParams(["location"]),
  async (req: Request, res: Response): Promise<void> => {
    const location = String(req.query.location);
    const ym = req.query.ym ? String(req.query.ym) : undefined;
    const cacheKey = buildCacheKey("realestate:apt", { location, ym: ym ?? "current" });

    const cached = await getCached(cacheKey);
    if (cached) { res.json(cached); return; }

    try {
      const txns = await getAptTransactions(location, ym);
      const prices = txns.map((t) => t.dealAmount * 10000).filter((p) => p > 0);
      const stats = prices.length > 0
        ? {
            minPrice: Math.min(...prices),
            maxPrice: Math.max(...prices),
            avgPrice: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
          }
        : { minPrice: 0, maxPrice: 0, avgPrice: 0 };

      const isMock = !process.env.PUBLIC_DATA_KEY;
      const response = wrapResponse(
        isMock ? "mock" : "molit",
        { location, yearMonth: ym, count: txns.length, ...stats, transactions: txns },
        null,
        3600
      );
      await setCache(cacheKey, response, 3600);
      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Real estate lookup failed";
      res.status(502).json({ error: "provider_error", message: msg });
    }
  }
);

export default router;
