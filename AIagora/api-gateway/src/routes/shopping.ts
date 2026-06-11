import { Router, Request, Response } from "express";
import { searchCoupang } from "../providers/revenue/coupang";
import { searchElevenst } from "../providers/revenue/elevenst";
import { naverShoppingSearch } from "../providers/free/naver";
import { searchDaangn } from "../providers/free/daangn";
import { searchDanawa } from "../providers/free/danawa";
import { getCached, setCache, buildCacheKey, wrapResponse } from "../cache/redis";
import { requireParams } from "../middleware/normalize";
import { ProductItem } from "../types";

const router = Router();

// GET /api/shopping/search?q=키워드&budget=금액&used=true
router.get("/search", requireParams(["q"]), async (req: Request, res: Response): Promise<void> => {
  const q = String(req.query.q);
  const budget = req.query.budget ? Number(req.query.budget) : undefined;
  const includeUsed = req.query.used === "true";
  const cacheKey = buildCacheKey("shopping:search", { q, budget, includeUsed });

  const cached = await getCached(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  const promises: Promise<unknown>[] = [
    searchCoupang(q, 10),
    naverShoppingSearch(q, 10),
    searchElevenst(q, 10),
    searchDanawa(q, 10),
  ];

  if (includeUsed) {
    promises.push(searchDaangn(q, 6));
  }

  const [coupangResult, naverItems, elevenstItems, danawaResult, daangnItems] =
    await Promise.allSettled(promises);

  const allProducts: ProductItem[] = [];
  let primaryAffiliate: string | null = null;

  if (coupangResult.status === "fulfilled") {
    const r = coupangResult.value as Awaited<ReturnType<typeof searchCoupang>>;
    allProducts.push(...r.products);
    primaryAffiliate = r.affiliateLinks[0] ?? null;
  }
  if (naverItems.status === "fulfilled") {
    allProducts.push(...(naverItems.value as ProductItem[]));
  }
  if (elevenstItems.status === "fulfilled") {
    allProducts.push(...(elevenstItems.value as ProductItem[]));
  }
  if (danawaResult.status === "fulfilled") {
    const r = danawaResult.value as Awaited<ReturnType<typeof searchDanawa>>;
    allProducts.push(...r.products);
  }
  if (daangnItems && daangnItems.status === "fulfilled") {
    allProducts.push(...(daangnItems.value as ProductItem[]));
  }

  const filtered = budget
    ? allProducts.filter((p) => p.price <= budget)
    : allProducts;

  filtered.sort((a, b) => a.price - b.price);

  const sources = [
    coupangResult.status === "fulfilled" ? "coupang" : null,
    naverItems.status === "fulfilled" ? "naver" : null,
    elevenstItems.status === "fulfilled" ? "11st" : null,
    danawaResult.status === "fulfilled" ? "danawa" : null,
    daangnItems?.status === "fulfilled" ? "daangn" : null,
  ]
    .filter(Boolean)
    .join("+");

  const response = wrapResponse(
    sources || "none",
    { keyword: q, budget, used: includeUsed, total: filtered.length, products: filtered.slice(0, 30) },
    primaryAffiliate
  );

  await setCache(cacheKey, response);
  res.json(response);
});

// GET /api/shopping/compare?q=키워드  → 다나와 가격 비교 특화
router.get("/compare", requireParams(["q"]), async (req: Request, res: Response): Promise<void> => {
  const q = String(req.query.q);
  const cacheKey = buildCacheKey("shopping:compare", { q });

  const cached = await getCached(cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    const result = await searchDanawa(q, 15);
    const response = wrapResponse("danawa", result, null);
    await setCache(cacheKey, response);
    res.json(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Price compare failed";
    res.status(502).json({ error: "provider_error", message: msg });
  }
});

// GET /api/shopping/used?q=키워드  → 당근마켓 중고 특화
router.get("/used", requireParams(["q"]), async (req: Request, res: Response): Promise<void> => {
  const q = String(req.query.q);
  const limit = Math.min(Number(req.query.limit ?? 6), 12);
  const cacheKey = buildCacheKey("shopping:used", { q });

  const cached = await getCached(cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    const items = await searchDaangn(q, limit);
    const response = wrapResponse("daangn", { keyword: q, count: items.length, items }, null);
    await setCache(cacheKey, response);
    res.json(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Used goods search failed";
    res.status(502).json({ error: "provider_error", message: msg });
  }
});

export default router;
