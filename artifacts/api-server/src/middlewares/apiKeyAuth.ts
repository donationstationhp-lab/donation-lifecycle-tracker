import { type Request, type Response, type NextFunction } from "express";

/**
 * Middleware that requires a valid X-API-Key header.
 * Returns 401 if the key is missing or does not match DONATION_STATION_API_KEY.
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.DONATION_STATION_API_KEY;
  if (!expected) {
    // Key not configured — allow (dev fallback)
    next();
    return;
  }
  const provided = req.headers["x-api-key"];
  if (!provided || provided !== expected) {
    res.status(401).json({ error: "Unauthorized: missing or invalid X-API-Key" });
    return;
  }
  next();
}
