import { type Request, type Response, type NextFunction } from "express";
import { getSessionUser, SESSION_COOKIE_NAME } from "../lib/sessionAuth";

/**
 * Gate for protected routes. Accepts either:
 *   - a valid `X-API-Key` header (for CLI/automation callers), or
 *   - a valid signed-in staff session cookie (for browser callers).
 *
 * When DONATION_STATION_API_KEY is unset entirely, requests are allowed
 * through without a session either — a dev-only fallback for running
 * locally without secrets configured.
 */
export function staffAuth(req: Request, res: Response, next: NextFunction): void {
  const expectedKey = process.env.DONATION_STATION_API_KEY;
  const providedKey = req.headers["x-api-key"];

  if (expectedKey && providedKey === expectedKey) {
    next();
    return;
  }

  const token = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
  if (token) {
    getSessionUser(token)
      .then((user) => {
        if (user) {
          next();
          return;
        }
        res.status(401).json({ error: "Unauthorized: sign in required" });
      })
      .catch(next);
    return;
  }

  if (!expectedKey) {
    next();
    return;
  }

  res.status(401).json({ error: "Unauthorized: sign in or provide a valid X-API-Key" });
}
