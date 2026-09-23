import { type Request, type Response, type NextFunction } from "express";
import { getSessionUser, SESSION_COOKIE_NAME } from "../lib/sessionAuth";

export type StaffRole = "staff" | "supervisor";

/**
 * Gate for protected routes. Accepts either:
 *   - a valid `X-API-Key` header (for CLI/automation callers), or
 *   - a valid signed-in staff session cookie (for browser callers).
 *
 * A valid API key is treated as supervisor-level access, since it's used by
 * trusted CLI/automation callers rather than an individual staff member.
 *
 * When DONATION_STATION_API_KEY is unset entirely AND NODE_ENV is not
 * "production", requests are allowed through without a session either — a
 * dev-only fallback for running locally without secrets configured. In
 * production this fails closed instead: an unset key is a misconfiguration,
 * not an invitation to run with no auth at all.
 */
export function staffAuth(req: Request, res: Response, next: NextFunction): void {
  const expectedKey = process.env.DONATION_STATION_API_KEY;
  const providedKey = req.headers["x-api-key"];

  if (expectedKey && providedKey === expectedKey) {
    res.locals.staffRole = "supervisor" satisfies StaffRole;
    res.locals.authMethod = "api-key";
    next();
    return;
  }

  const token = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
  if (token) {
    getSessionUser(token)
      .then((user) => {
        if (user) {
          res.locals.staffRole = (user.role as StaffRole) ?? "staff";
          res.locals.authMethod = "session";
          res.locals.staffUserId = user.id;
          next();
          return;
        }
        res.status(401).json({ error: "Unauthorized: sign in required" });
      })
      .catch(next);
    return;
  }

  if (!expectedKey && process.env.NODE_ENV !== "production") {
    res.locals.staffRole = "supervisor" satisfies StaffRole;
    res.locals.authMethod = "dev-fallback";
    next();
    return;
  }

  res.status(401).json({ error: "Unauthorized: sign in or provide a valid X-API-Key" });
}

/** Gate for routes that require the elevated "supervisor" role on top of staffAuth. */
export function requireSupervisor(_req: Request, res: Response, next: NextFunction): void {
  if (res.locals.staffRole !== "supervisor") {
    res.status(403).json({ error: "Supervisor access required" });
    return;
  }
  next();
}
