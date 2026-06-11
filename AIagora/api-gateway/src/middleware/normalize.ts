import { Request, Response, NextFunction } from "express";

export function normalizeError(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const message = err instanceof Error ? err.message : "Internal server error";
  const status = (err as { status?: number }).status ?? 500;
  res.status(status).json({ error: true, message });
}

export function requireParams(keys: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const missing = keys.filter((k) => !req.query[k]);
    if (missing.length > 0) {
      res.status(400).json({
        error: "missing_params",
        message: `Required query parameters: ${missing.join(", ")}`,
      });
      return;
    }
    next();
  };
}
