import { randomBytes } from "crypto";
import { eq, and, gt } from "drizzle-orm";
import { db, sessionsTable, staffUsersTable, type StaffUser } from "@workspace/db";
import { isMissingColumn } from "./dbErrors";

export const SESSION_COOKIE_NAME = "ds_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export type StaffSessionUser = Pick<
  StaffUser,
  "id" | "email" | "name" | "passwordHash" | "role" | "mustChangePassword" | "createdAt"
>;

function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export async function createSession(userId: string): Promise<{ id: string; expiresAt: Date }> {
  const id = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessionsTable).values({ id, userId, expiresAt });
  return { id, expiresAt };
}

export async function getSessionUser(token: string | undefined): Promise<StaffSessionUser | null> {
  if (!token) return null;

  const where = and(eq(sessionsTable.id, token), gt(sessionsTable.expiresAt, new Date()));
  const from = () => db
    .select({
      id: staffUsersTable.id,
      email: staffUsersTable.email,
      name: staffUsersTable.name,
      passwordHash: staffUsersTable.passwordHash,
      role: staffUsersTable.role,
      mustChangePassword: staffUsersTable.mustChangePassword,
      createdAt: staffUsersTable.createdAt,
    })
    .from(sessionsTable)
    .innerJoin(staffUsersTable, eq(sessionsTable.userId, staffUsersTable.id))
    .where(where)
    .limit(1);

  try {
    return (await from())[0] ?? null;
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
      .from(sessionsTable)
      .innerJoin(staffUsersTable, eq(sessionsTable.userId, staffUsersTable.id))
      .where(where)
      .limit(1);
    return legacyUser
      ? { ...legacyUser, mustChangePassword: false }
      : null;
  }
}

export async function deleteSession(token: string): Promise<void> {
  await db.delete(sessionsTable).where(eq(sessionsTable.id, token));
}
