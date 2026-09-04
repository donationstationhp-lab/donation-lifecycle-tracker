import { randomBytes } from "crypto";
import { eq, and, gt } from "drizzle-orm";
import { db, sessionsTable, staffUsersTable, type StaffUser } from "@workspace/db";

export const SESSION_COOKIE_NAME = "ds_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export async function createSession(userId: string): Promise<{ id: string; expiresAt: Date }> {
  const id = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessionsTable).values({ id, userId, expiresAt });
  return { id, expiresAt };
}

export async function getSessionUser(token: string | undefined): Promise<StaffUser | null> {
  if (!token) return null;

  const rows = await db
    .select({ user: staffUsersTable })
    .from(sessionsTable)
    .innerJoin(staffUsersTable, eq(sessionsTable.userId, staffUsersTable.id))
    .where(and(eq(sessionsTable.id, token), gt(sessionsTable.expiresAt, new Date())))
    .limit(1);

  return rows[0]?.user ?? null;
}

export async function deleteSession(token: string): Promise<void> {
  await db.delete(sessionsTable).where(eq(sessionsTable.id, token));
}
