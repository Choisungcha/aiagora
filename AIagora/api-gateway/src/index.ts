import "dotenv/config";
import express from "express";
import { apiRateLimit } from "./middleware/rateLimit";
import { normalizeError } from "./middleware/normalize";
import shoppingRouter from "./routes/shopping";
import travelRouter from "./routes/travel";
import foodRouter from "./routes/food";
import marketRouter from "./routes/market";
import newsRouter from "./routes/news";
import financeRouter from "./routes/finance";
import transitRouter from "./routes/transit";
import deliveryRouter from "./routes/delivery";
import weatherRouter from "./routes/weather";
import realestateRouter from "./routes/realestate";

const app = express();
const PORT = Number(process.env.GATEWAY_PORT ?? 4000);

app.use(express.json());

// Trust proxy for correct IP extraction behind Docker/nginx
app.set("trust proxy", 1);

// Rate limit: 60 req/min per IP
app.use(apiRateLimit);

// Health check — bypasses rate limit (applied before routes)
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "api-gateway", ts: Date.now() });
});

// Routes
app.use("/api/shopping", shoppingRouter);
app.use("/api/travel", travelRouter);
app.use("/api/food", foodRouter);
app.use("/api/market", marketRouter);
app.use("/api/news", newsRouter);
app.use("/api/finance", financeRouter);
app.use("/api/transit", transitRouter);
app.use("/api/delivery", deliveryRouter);
app.use("/api/weather", weatherRouter);
app.use("/api/realestate", realestateRouter);

// 404
app.use((_req, res) => {
  res.status(404).json({ error: "not_found", message: "Route not found" });
});

// Global error handler
app.use(normalizeError);

app.listen(PORT, () => {
  console.log(`[API Gateway] listening on port ${PORT}`);
});

export default app;
