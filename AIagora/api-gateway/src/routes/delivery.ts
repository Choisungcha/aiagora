import { Router, Request, Response } from "express";
import { trackDelivery } from "../providers/free/delivery";
import { getCached, setCache, buildCacheKey, wrapResponse } from "../cache/redis";
import { requireParams } from "../middleware/normalize";

const router = Router();

// GET /api/delivery/track?tracking=운송장번호&carrier=04
// carrier 코드: 04=CJ대한통운, 05=한진, 06=롯데, 08=우체국, 11=로젠, 23=경동
router.get(
  "/track",
  requireParams(["tracking"]),
  async (req: Request, res: Response): Promise<void> => {
    const tracking = String(req.query.tracking);
    const carrier = String(req.query.carrier ?? "04");
    const cacheKey = buildCacheKey("delivery:track", { tracking, carrier });

    // 2분 캐시 (배송 상태는 자주 바뀌지 않음)
    const cached = await getCached(cacheKey);
    if (cached) { res.json(cached); return; }

    try {
      const status = await trackDelivery(tracking, carrier);
      const response = wrapResponse(
        process.env.SWEETTRACKER_API_KEY ? "sweettracker" : "mock",
        status,
        null,
        120
      );
      await setCache(cacheKey, response, 120);
      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Delivery tracking failed";
      res.status(502).json({ error: "provider_error", message: msg });
    }
  }
);

export default router;
