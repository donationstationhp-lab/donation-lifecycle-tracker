/**
 * Staff sign-in — unauthenticated (login/logout) or self-checking (me).
 * Mounted BEFORE the apiKeyAuth gate in routes/index.ts.
 *
 * There is no public signup: staff accounts are provisioned via the
 * `pnpm --filter @workspace/scripts run create-staff-user` CLI script (main
 * branch). Replaces Clerk for staff/supervisor sign-in only — donor/community
 * sign-in is unaffected and still goes through Clerk (see apiKeyAuth.ts).
 */
import { Router, type IRouter } from "express";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db, staffUsersTable, hashPassword, verifyPassword } from "@workspace/db";
import { isMissingColumn, isUniqueViolation } from "../lib/dbErrors";
import { logger } from "../lib/logger";
import {
  createSession,
  deleteSession,
  getSessionUser,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
} from "../lib/sessionAuth";

const router: IRouter = Router();

// A precomputed hash checked against unknown emails so login timing doesn't
// reveal whether an email is registered.
const DUMMY_HASH = hashPassword(randomBytes(32).toString("hex"));
const BOOTSTRAP_ADVISORY_LOCK = 0x44534253;

class BootstrapUnavailableError extends Error {}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS,
  };
}

function toPublicUser(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  mustChangePassword: boolean;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  };
}

function hasBootstrapToken(authorization: string | undefined, expected: string): boolean {
  const prefix = "Bearer ";
  if (!authorization?.startsWith(prefix)) return false;
  const provided = Buffer.from(authorization.slice(prefix.length), "utf8");
  const configured = Buffer.from(expected, "utf8");
  return provided.length === configured.length && timingSafeEqual(provided, configured);
}

async function findStaffUserByEmail(email: string) {
  try {
    const [user] = await db
      .select({
        id: staffUsersTable.id,
        email: staffUsersTable.email,
        name: staffUsersTable.name,
        passwordHash: staffUsersTable.passwordHash,
        role: staffUsersTable.role,
        mustChangePassword: staffUsersTable.mustChangePassword,
        createdAt: staffUsersTable.createdAt,
      })
      .from(staffUsersTable)
      .where(eq(staffUsersTable.email, email))
      .limit(1);
    return user ?? null;
  } catch (error) {
    if (!isMissingColumn(error, "must_change_password")) {
      throw error;
    }
    const [legacyUser] = await db
      .select({
        id: staffUsersTable.id,
        email: staffUsersTable.email,
        name: staffUsersTable.name,
        passwordHash: staffUsersTable.passwordHash,
        role: staffUsersTable.role,
        createdAt: staffUsersTable.createdAt,
      })
      .from(staffUsersTable)
      .where(eq(staffUsersTable.email, email))
      .limit(1);
    return legacyUser
      ? { ...legacyUser, mustChangePassword: false }
      : null;
  }
}

router.post("/auth/bootstrap-supervisor", async (req, res): Promise<void> => {
  if (process.env.REPLIT_DEPLOYMENT !== "1") {
    res.status(404).json({ error: "Not found." });
    return;
  }

  const email = process.env.BOOTSTRAP_SUPERVISOR_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_SUPERVISOR_PASSWORD;
  const bootstrapToken = process.env.BOOTSTRAP_TOKEN;
  if (
    !email ||
    email.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !password ||
    password.length < 8 ||
    !bootstrapToken ||
    Buffer.byteLength(bootstrapToken, "utf8") < 32
  ) {
    res.status(503).json({ error: "Supervisor bootstrap is unavailable." });
    return;
  }

  if (!hasBootstrapToken(req.get("authorization"), bootstrapToken)) {
    res.status(401).json({ error: "Invalid bootstrap authorization." });
    return;
  }

  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name || name.length > 160) {
    res.status(400).json({ error: "A name of 1 to 160 characters is required." });
    return;
  }

  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${BOOTSTRAP_ADVISORY_LOCK}::bigint)`);

      const [usedToken] = await tx
        .select({ id: staffUsersTable.id })
        .from(staffUsersTable)
        .where(isNotNull(staffUsersTable.bootstrapTokenUsedAt))
        .limit(1);
      const [existingSupervisor] = await tx
        .select({ id: staffUsersTable.id })
        .from(staffUsersTable)
        .where(eq(staffUsersTable.role, "supervisor"))
        .limit(1);
      if (usedToken || existingSupervisor) throw new BootstrapUnavailableError();

      await tx.insert(staffUsersTable).values({
        id: randomUUID(),
        email,
        name,
        passwordHash: hashPassword(password),
        role: "supervisor",
        mustChangePassword: true,
        bootstrapTokenUsedAt: new Date(),
      });
    });

    logger.info({ event: "staff_supervisor_bootstrap_completed" }, "One-time supervisor bootstrap completed");
    res.status(201).json({
      created: true,
      role: "supervisor",
      mustChangePassword: true,
    });
  } catch (error) {
    if (
      isMissingColumn(error, "must_change_password") ||
      isMissingColumn(error, "bootstrap_token_used_at")
    ) {
      res.status(503).json({ error: "Supervisor bootstrap is unavailable until its database schema is applied." });
      return;
    }
    if (error instanceof BootstrapUnavailableError || isUniqueViolation(error)) {
      res.status(409).json({ error: "Supervisor bootstrap is no longer available." });
      return;
    }
    logger.warn({ event: "staff_supervisor_bootstrap_failed" }, "Supervisor bootstrap did not complete");
    res.status(500).json({ error: "Unable to create the supervisor account." });
  }
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const { email, password } = req.body ?? {};

  if (!email || typeof email !== "string" || !password || typeof password !== "string") {
    res.status(400).json({ error: "Email and password are required." });
    return;
  }

  const user = await findStaffUserByEmail(email.trim().toLowerCase());

  const valid = verifyPassword(password, user ? user.passwordHash : DUMMY_HASH);

  if (!user || !valid) {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }

  const session = await createSession(user.id);
  res.cookie(SESSION_COOKIE_NAME, session.id, cookieOptions());
  res.json(toPublicUser(user));
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  const token = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
  if (token) {
    await deleteSession(token);
  }
  res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
  res.status(204).end();
});

router.get("/auth/me", async (req, res): Promise<void> => {
  const token = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
  const user = await getSessionUser(token);
  if (!user) {
    res.status(401).json({ error: "Not signed in." });
    return;
  }
  res.json(toPublicUser(user));
});

router.post("/auth/change-password", async (req, res): Promise<void> => {
  const token = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
  const user = await getSessionUser(token);
  if (!user) {
    res.status(401).json({ error: "Sign in to change your password." });
    return;
  }
  if (!user.mustChangePassword) {
    res.status(403).json({ error: "A forced password change is not pending." });
    return;
  }

  const { currentPassword, newPassword } = req.body ?? {};
  if (
    typeof currentPassword !== "string" ||
    typeof newPassword !== "string" ||
    newPassword.length < 8
  ) {
    res.status(400).json({ error: "Enter your current password and a new password of at least 8 characters." });
    return;
  }
  if (!verifyPassword(currentPassword, user.passwordHash)) {
    res.status(401).json({ error: "Current password is incorrect." });
    return;
  }
  if (verifyPassword(newPassword, user.passwordHash)) {
    res.status(400).json({ error: "Choose a new password different from your current password." });
    return;
  }

  const [updated] = await db
    .update(staffUsersTable)
    .set({ passwordHash: hashPassword(newPassword), mustChangePassword: false })
    .where(and(
      eq(staffUsersTable.id, user.id),
      eq(staffUsersTable.mustChangePassword, true),
    ))
    .returning();
  if (!updated) {
    res.status(409).json({ error: "The password was already changed. Sign in again." });
    return;
  }

  res.json(toPublicUser(updated));
});

export default router;
