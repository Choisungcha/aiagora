import rateLimit from "express-rate-limit";

export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,             // 60 requests per IP per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "rate_limit_exceeded",
    message: "Too many requests. Limit: 60/minute per IP.",
    retryAfter: 60,
  },
  keyGenerator: (req) => {
    // Support X-Forwarded-For behind a proxy
    const forwarded = req.headers["x-forwarded-for"];
    const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0];
    return ip || req.ip || "unknown";
  },
});
