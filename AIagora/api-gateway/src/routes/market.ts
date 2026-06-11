import { Router, Request, Response } from "express";
import { getExchangeRate } from "../providers/free/bok";
import { naverShoppingSearch } from "../providers/free/naver";
import { getCached, setCache, buildCacheKey, wrapResponse } from "../cache/redis";
import { requireParams } from "../middleware/normalize";

const router = Router();

// GET /api/market/exchange?currency=USD
router.get(
  "/exchange",
  requireParams(["currency"]),
  async (req: Request, res: Response): Promise<void> => {
    const currency = String(req.query.currency).toUpperCase();
    const cacheKey = buildCacheKey("market:exchange", { currency });

    // Exchange rates: cache 1 hour (rates don't change intraday)
    const cached = await getCached(cacheKey);
    if (cached) { res.json(cached); return; }

    try {
      const rate = await getExchangeRate(currency);
      const response = wrapResponse("bok", rate, null, 3600);
      await setCache(cacheKey, response, 3600);
      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Exchange rate lookup failed";
      res.status(502).json({ error: "provider_error", message: msg });
    }
  }
);

// GET /api/market/price?item=상품명
router.get(
  "/price",
  requireParams(["item"]),
  async (req: Request, res: Response): Promise<void> => {
    const item = String(req.query.item);
    const cacheKey = buildCacheKey("market:price", { item });

    const cached = await getCached(cacheKey);
    if (cached) { res.json(cached); return; }

    try {
      const products = await naverShoppingSearch(item, 20);
      const prices = products.map((p) => p.price).filter((p) => p > 0);
      const stats =
        prices.length > 0
          ? {
              minPrice: Math.min(...prices),
              maxPrice: Math.max(...prices),
              avgPrice: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
            }
          : { minPrice: 0, maxPrice: 0, avgPrice: 0 };

      const response = wrapResponse(
        "naver",
        { item, ...stats, products: products.slice(0, 10) },
        null
      );
      await setCache(cacheKey, response);
      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Price lookup failed";
      res.status(502).json({ error: "provider_error", message: msg });
    }
  }
);

export default router;
