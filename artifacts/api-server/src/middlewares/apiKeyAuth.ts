import { type Request, type Response, type NextFunction } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { timingSafeEqual } from "node:crypto";
import { getStartupSecret } from "../lib/startupSecrets";
import { getSessionUser as getSessionUserFromDb, SESSION_COOKIE_NAME, type StaffSessionUser } from "../lib/sessionAuth";

export type StaffRole = "staff" | "supervisor";
export type AppRole = StaffRole | "community";
const communityRoleCache = new Map<string, { role: AppRole; expiresAt: number }>();

type ApiAuthRequest = Request;
type CommunityRoleResolver = (req: ApiAuthRequest) => Promise<AppRole | null>;
type UserIdResolver = (req: ApiAuthRequest) => string | null | undefined;
type SessionUserResolver = (token: string) => Promise<StaffSessionUser | null>;

export interface ApiKeyAuthDependencies {
  getCommunityRole?: CommunityRoleResolver;
  getClerkUserId?: UserIdResolver;
  getSessionToken?: (req: ApiAuthRequest) => string | undefined;
  getSessionUser?: SessionUserResolver;
  getExpectedApiKey?: () => string | undefined;
}

function safeEqual(provided: string, expected: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Donor/community identity only. Staff and supervisor roles are no longer
 * resolved through Clerk — see routes/auth.ts and lib/sessionAuth.ts for the
 * staff session-cookie login this replaced. A Clerk user is only ever
 * "community" here; anything else (unset role, or "staff"/"supervisor" left
 * over from an old Clerk account) is rejected rather than silently granted.
 */
async function getClerkCommunityRole(req: Request): Promise<AppRole | null> {
  const { userId } = getAuth(req);
  if (!userId) return null;
  const cached = communityRoleCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.role;
  const user = await clerkClient.users.getUser(userId);
  const metadataRole = user.publicMetadata.role;
  if (metadataRole !== "community") return null;
  const role: AppRole = "community";
  communityRoleCache.set(userId, { role, expiresAt: Date.now() + 60_000 });
  return role;
}

export function createApiKeyAuth({
  getCommunityRole = getClerkCommunityRole,
  getClerkUserId = (req) => getAuth(req).userId,
  getSessionToken = (req) => req.cookies?.[SESSION_COOKIE_NAME] as string | undefined,
  getSessionUser = getSessionUserFromDb,
  getExpectedApiKey = () => getStartupSecret("DONATION_STATION_API_KEY"),
}: ApiKeyAuthDependencies = {}) {
  return async function apiKeyAuth(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const expected = getExpectedApiKey();
    const provided = req.headers["x-api-key"];
    if (
      expected &&
      typeof provided === "string" &&
      safeEqual(provided, expected)
    ) {
      res.locals.staffRole = "supervisor" satisfies StaffRole;
      res.locals.userRole = "supervisor" satisfies AppRole;
      res.locals.authMethod = "api-key";
      next();
      return;
    }

    // Staff/supervisor: a signed-in session cookie, not Clerk.
    const sessionToken = getSessionToken(req);
    if (sessionToken) {
      try {
        const user = await getSessionUser(sessionToken);
        if (user) {
          const role = (user.role as StaffRole) ?? "staff";
          res.locals.staffRole = role;
          res.locals.userRole = role;
          res.locals.authMethod = "session";
          res.locals.staffUserId = user.id;
          next();
          return;
        }
      } catch {
        res.status(401).json({ error: "Unable to validate staff session" });
        return;
      }
      // Invalid/expired cookie: fall through to the community check below
      // rather than failing closed immediately, since a stale staff cookie
      // and a valid Clerk donor session can be present on the same browser.
    }

    // Community: Clerk only.
    const userId = getClerkUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Sign-in required" });
      return;
    }

    try {
      const role = await getCommunityRole(req);
      if (!role) {
        res.status(403).json({ error: "Community access has not been assigned" });
        return;
      }
      res.locals.userRole = role;
      res.locals.authMethod = "clerk";
      res.locals.communityUserId = userId;
      next();
    } catch {
      res.status(401).json({ error: "Unable to validate community session" });
    }
  };
}

export const apiKeyAuth = createApiKeyAuth();

export function requireSupervisor(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.locals.staffRole !== "supervisor") {
    res.status(403).json({ error: "Supervisor access required" });
    return;
  }
  next();
}

export function requireStaff(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.locals.staffRole !== "staff" && res.locals.staffRole !== "supervisor") {
    res.status(403).json({ error: "Staff access required" });
    return;
  }
  next();
}

export function requireCommunity(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.locals.userRole !== "community" || res.locals.authMethod !== "clerk") {
    res.status(403).json({ error: "Community access required" });
    return;
  }
  next();
}
