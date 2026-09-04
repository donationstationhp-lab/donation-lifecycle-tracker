/**
 * Staff sign-in — unauthenticated (login/logout) or self-checking (me).
 * Mounted BEFORE the staffAuth gate in routes/index.ts.
 *
 * There is no public signup: staff accounts are provisioned via the
 * `pnpm --filter @workspace/scripts run create-staff-user` CLI script.
 */
import { Router, type IRouter } from "express";
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db, staffUsersTable, hashPassword, verifyPassword } from "@workspace/db";
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

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS,
  };
}

function toPublicUser(user: { id: string; email: string; name: string }) {
  return { id: user.id, email: user.email, name: user.name };
}

router.post("/auth/login", async (req, res): Promise<void> => {
  const { email, password } = req.body ?? {};

  if (!email || typeof email !== "string" || !password || typeof password !== "string") {
    res.status(400).json({ error: "Email and password are required." });
    return;
  }

  const [user] = await db
    .select()
    .from(staffUsersTable)
    .where(eq(staffUsersTable.email, email.trim().toLowerCase()))
    .limit(1);

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

export default router;
