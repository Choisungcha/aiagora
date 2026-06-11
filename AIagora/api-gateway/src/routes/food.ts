import { Router, Request, Response } from "express";
import { kakaoPlaceSearch } from "../providers/free/kakao";
import { naverLocalSearch } from "../providers/free/naver";
import { getCached, setCache, buildCacheKey, wrapResponse } from "../cache/redis";
import { requireParams } from "../middleware/normalize";
import { PlaceResult } from "../types";

const router = Router();

const CATEGORY_MAP: Record<string, string> = {
  음식점: "FD6",
  카페: "CE7",
  편의점: "CS2",
  주차장: "PK6",
  주유소: "OL7",
};

// GET /api/food/search?location=위치&category=카테고리
router.get(
  "/search",
  requireParams(["location"]),
  async (req: Request, res: Response): Promise<void> => {
    const location = String(req.query.location);
    const category = String(req.query.category ?? "음식점");
    const kakaoCode = CATEGORY_MAP[category] ?? "FD6";

    const cacheKey = buildCacheKey("food:search", { location, category });
    const cached = await getCached(cacheKey);
    if (cached) { res.json(cached); return; }

    const [kakaoResult, naverResult] = await Promise.allSettled([
      kakaoPlaceSearch(`${location} ${category}`, kakaoCode, 10),
      naverLocalSearch(`${location} ${category}`, 10),
    ]);

    const places: PlaceResult[] = [];
    if (kakaoResult.status === "fulfilled") places.push(...kakaoResult.value);
    if (naverResult.status === "fulfilled") places.push(...naverResult.value);

    // Deduplicate by name (Kakao priority)
    const seen = new Set<string>();
    const unique = places.filter((p) => {
      if (seen.has(p.name)) return false;
      seen.add(p.name);
      return true;
    });

    const sources = [
      kakaoResult.status === "fulfilled" ? "kakao" : null,
      naverResult.status === "fulfilled" ? "naver" : null,
    ].filter(Boolean).join("+");

    const response = wrapResponse(
      sources || "none",
      { location, category, count: unique.length, places: unique },
      null
    );
    await setCache(cacheKey, response);
    res.json(response);
  }
);

export default router;
