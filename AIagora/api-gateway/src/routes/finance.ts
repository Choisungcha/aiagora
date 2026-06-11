import { Router, Request, Response } from "express";
import { searchStocks } from "../providers/free/stock";
import { getExchangeRate } from "../providers/free/bok";
import { getCryptoTickers } from "../providers/free/upbit";
import { searchDartDisclosures } from "../providers/free/dart";
import { getGasPrices } from "../providers/free/opinet";
import { getCached, setCache, buildCacheKey, wrapResponse } from "../cache/redis";
import { requireParams } from "../middleware/normalize";

const router = Router();

// GET /api/finance/stocks?q=삼성전자
router.get(
  "/stocks",
  requireParams(["q"]),
  async (req: Request, res: Response): Promise<void> => {
    const q = String(req.query.q);
    const limit = Math.min(Number(req.query.limit ?? 10), 30);
    const cacheKey = buildCacheKey("finance:stocks", { q });

    const cached = await getCached(cacheKey);
    if (cached) { res.json(cached); return; }

    try {
      const stocks = await searchStocks(q, limit);
      const response = wrapResponse("naver-finance", { keyword: q, count: stocks.length, stocks }, null, 300);
      await setCache(cacheKey, response, 300);
      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Stock search failed";
      res.status(502).json({ error: "provider_error", message: msg });
    }
  }
);

// GET /api/finance/exchange?currency=USD
router.get(
  "/exchange",
  requireParams(["currency"]),
  async (req: Request, res: Response): Promise<void> => {
    const currency = String(req.query.currency).toUpperCase();
    const cacheKey = buildCacheKey("finance:exchange", { currency });

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

// GET /api/finance/crypto?markets=KRW-BTC,KRW-ETH
// 업비트 시세 (인증 불필요)
router.get(
  "/crypto",
  async (req: Request, res: Response): Promise<void> => {
    const marketsParam = req.query.markets ? String(req.query.markets) : undefined;
    const markets = marketsParam ? marketsParam.split(",") : undefined;
    const cacheKey = buildCacheKey("finance:crypto", { markets: marketsParam ?? "default" });

    const cached = await getCached(cacheKey);
    if (cached) { res.json(cached); return; }

    try {
      const tickers = await getCryptoTickers(markets);
      const response = wrapResponse("upbit", { count: tickers.length, tickers }, null, 60);
      await setCache(cacheKey, response, 60);
      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Crypto ticker fetch failed";
      res.status(502).json({ error: "provider_error", message: msg });
    }
  }
);

// GET /api/finance/dart?company=삼성전자
// Open DART 공시 검색 (DART_API_KEY 없으면 mock)
router.get(
  "/dart",
  requireParams(["company"]),
  async (req: Request, res: Response): Promise<void> => {
    const company = String(req.query.company);
    const cacheKey = buildCacheKey("finance:dart", { company });

    const cached = await getCached(cacheKey);
    if (cached) { res.json(cached); return; }

    try {
      const disclosures = await searchDartDisclosures(company);
      const isMock = !process.env.DART_API_KEY;
      const response = wrapResponse(
        isMock ? "mock" : "dart",
        { company, count: disclosures.length, disclosures },
        null,
        3600
      );
      await setCache(cacheKey, response, 3600);
      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "DART disclosure search failed";
      res.status(502).json({ error: "provider_error", message: msg });
    }
  }
);

// GET /api/finance/gas?location=서울
// OPINET 주유소 가격 (OPINET_API_KEY 없으면 mock)
router.get(
  "/gas",
  async (req: Request, res: Response): Promise<void> => {
    const location = String(req.query.location ?? "전국");
    const cacheKey = buildCacheKey("finance:gas", { location });

    const cached = await getCached(cacheKey);
    if (cached) { res.json(cached); return; }

    try {
      const prices = await getGasPrices(location);
      const isMock = !process.env.OPINET_API_KEY;
      const response = wrapResponse(isMock ? "mock" : "opinet", prices, null, 3600);
      await setCache(cacheKey, response, 3600);
      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gas price lookup failed";
      res.status(502).json({ error: "provider_error", message: msg });
    }
  }
);

export default router;
