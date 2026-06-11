import { Router, Request, Response } from "express";
import { naverNewsSearch } from "../providers/free/naver";
import { getCached, setCache, buildCacheKey, wrapResponse } from "../cache/redis";
import { requireParams } from "../middleware/normalize";

const router = Router();

// GET /api/news/search?q=키워드
router.get(
  "/search",
  requireParams(["q"]),
  async (req: Request, res: Response): Promise<void> => {
    const q = String(req.query.q);
    const cacheKey = buildCacheKey("news:search", { q });

    // News: cache 10 minutes
    const cached = await getCached(cacheKey);
    if (cached) { res.json(cached); return; }

    try {
      const articles = await naverNewsSearch(q, 20);
      const response = wrapResponse("naver", { keyword: q, count: articles.length, articles }, null, 600);
      await setCache(cacheKey, response, 600);
      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "News search failed";
      res.status(502).json({ error: "provider_error", message: msg });
    }
  }
);

export default router;
