import { type Request, type Response, type NextFunction } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { timingSafeEqual } from "node:crypto";

export type StaffRole = "staff" | "supervisor";
const roleCache = new Map<string, { role: StaffRole; expiresAt: number }>();

type ApiAuthRequest = Request;
type RoleResolver = (req: ApiAuthRequest) => Promise<StaffRole | null>;
type UserIdResolver = (req: ApiAuthRequest) => string | null | undefined;

export interface ApiKeyAuthDependencies {
  getRole?: RoleResolver;
  getUserId?: UserIdResolver;
  getExpectedApiKey?: () => string | undefined;
}

function safeEqual(provided: string, expected: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function getClerkRole(req: Request): Promise<StaffRole | null> {
  const { userId } = getAuth(req);
  if (!userId) return null;
  const cached = roleCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.role;
  const user = await clerkClient.users.getUser(userId);
  const metadataRole = user.publicMetadata.role;
  const role: StaffRole | null =
    metadataRole === "staff" || metadataRole === "supervisor"
      ? metadataRole
      : null;
  if (!role) return null;
  roleCache.set(userId, { role, expiresAt: Date.now() + 60_000 });
  return role;
}

export function createApiKeyAuth({
  getRole = getClerkRole,
  getUserId = (req) => getAuth(req).userId,
  getExpectedApiKey = () => process.env.DONATION_STATION_API_KEY,
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
      res.locals.authMethod = "api-key";
      next();
      return;
    }

    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Staff sign-in required" });
      return;
    }

    try {
      const role = await getRole(req);
      if (!role) {
        res.status(403).json({ error: "Staff access has not been assigned" });
        return;
      }
      res.locals.staffRole = role;
      res.locals.authMethod = "clerk";
      res.locals.staffUserId = userId;
      next();
    } catch {
      res.status(401).json({ error: "Unable to validate staff session" });
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
