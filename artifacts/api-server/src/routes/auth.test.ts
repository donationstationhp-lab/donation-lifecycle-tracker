import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import cookieParser from "cookie-parser";
import { eq, sql } from "drizzle-orm";
import test from "node:test";
import { db, hashPassword, pool, sessionsTable, staffUsersTable } from "@workspace/db";
import { createApiKeyAuth, requireStaff } from "../middlewares/apiKeyAuth";
import authRouter from "./auth";

let schema: string;
let closeServer: () => Promise<void>;
let base: string;
const email = "bootstrap-fixture@example.invalid";
const initialPassword = "synthetic-initial-password";
const newPassword = "synthetic-replacement-password";
const bootstrapToken = "synthetic-test-bootstrap-token-with-at-least-32-bytes";

test.before(async () => {
  schema = `test_staff_bootstrap_${randomUUID().replaceAll("-", "")}`;
  await db.execute(sql`CREATE SCHEMA ${sql.identifier(schema)}`);
  await db.execute(sql`
    CREATE TABLE ${sql.identifier(schema)}.staff_users (
      id text PRIMARY KEY,
      email text NOT NULL UNIQUE,
      name text NOT NULL,
      password_hash text NOT NULL,
      role text NOT NULL DEFAULT 'staff',
      must_change_password boolean NOT NULL DEFAULT false,
      bootstrap_token_used_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE ${sql.identifier(schema)}.sessions (
      id text PRIMARY KEY,
      user_id text NOT NULL REFERENCES ${sql.identifier(schema)}.staff_users(id),
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const selectTestSchema = (client: {
    query(text: string): Promise<unknown>;
    emit(event: string, error: unknown): unknown;
  }) => {
    void client.query(`SET search_path TO "${schema}"`).catch((error: unknown) => {
      client.emit("error", error);
    });
  };
  pool.on("acquire", selectTestSchema);

  const app = express();
  app.use(express.json(), cookieParser(), authRouter);
  app.use(createApiKeyAuth({
    getExpectedApiKey: () => undefined,
    getClerkUserId: () => null,
  }));
  app.get("/staff-only", requireStaff, (_req, res) => res.json({ ok: true }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  base = `http://127.0.0.1:${address.port}`;
  closeServer = () => new Promise((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  });
});

test.after(async () => {
  if (closeServer) await closeServer();
  if (schema) {
    await db.execute(sql`DROP SCHEMA ${sql.identifier(schema)} CASCADE`);
  }
  if (pool) await pool.end();
});

test("bootstrap is Production-only, single-use, and forces a password change", async () => {
  const envKeys = [
    "REPLIT_DEPLOYMENT",
    "BOOTSTRAP_SUPERVISOR_EMAIL",
    "BOOTSTRAP_SUPERVISOR_PASSWORD",
    "BOOTSTRAP_TOKEN",
  ] as const;
  const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const restoreEnv = () => {
    for (const key of envKeys) {
      const value = previousEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  const bootstrap = (token: string) => fetch(`${base}/auth/bootstrap-supervisor`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ name: "Bootstrap Fixture Supervisor" }),
  });
  const login = (password: string) => fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  try {
    process.env.BOOTSTRAP_SUPERVISOR_EMAIL = email;
    process.env.BOOTSTRAP_SUPERVISOR_PASSWORD = initialPassword;
    process.env.BOOTSTRAP_TOKEN = bootstrapToken;
    delete process.env.REPLIT_DEPLOYMENT;
    assert.equal((await bootstrap(bootstrapToken)).status, 404);

    process.env.REPLIT_DEPLOYMENT = "1";
    assert.equal((await bootstrap("wrong-token-that-is-long-enough-for-the-check")).status, 401);
    assert.equal((await db.select().from(staffUsersTable)).length, 0);

    const attempts = await Promise.all([
      bootstrap(bootstrapToken),
      bootstrap(bootstrapToken),
    ]);
    assert.deepEqual(attempts.map((response) => response.status).sort((a, b) => a - b), [201, 409]);
    const createdResponse = attempts.find((response) => response.status === 201)!;
    assert.deepEqual(await createdResponse.json(), {
      created: true,
      role: "supervisor",
      mustChangePassword: true,
    });

    const [created] = await db.select().from(staffUsersTable)
      .where(eq(staffUsersTable.email, email)).limit(1);
    assert.ok(created);
    assert.equal(created.role, "supervisor");
    assert.equal(created.mustChangePassword, true);
    assert.ok(created.bootstrapTokenUsedAt);
    assert.equal(
      (await db.select().from(sessionsTable)
        .where(eq(sessionsTable.userId, created.id))).length,
      0,
    );
    assert.equal((await bootstrap(bootstrapToken)).status, 409);

    const signedIn = await login(initialPassword);
    assert.equal(signedIn.status, 200);
    assert.equal((await signedIn.json() as { mustChangePassword: boolean }).mustChangePassword, true);
    const cookie = signedIn.headers.get("set-cookie")!.split(";")[0];
    const blocked = await fetch(`${base}/staff-only`, { headers: { cookie } });
    assert.equal(blocked.status, 403);
    assert.equal((await blocked.json() as { code: string }).code, "PASSWORD_CHANGE_REQUIRED");

    const changed = await fetch(`${base}/auth/change-password`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ currentPassword: initialPassword, newPassword }),
    });
    assert.equal(changed.status, 200);
    assert.equal((await changed.json() as { mustChangePassword: boolean }).mustChangePassword, false);
    assert.equal((await fetch(`${base}/staff-only`, { headers: { cookie } })).status, 200);
    assert.equal((await login(initialPassword)).status, 401);
    assert.equal((await login(newPassword)).status, 200);

    await db.execute(sql`ALTER TABLE staff_users DROP COLUMN bootstrap_token_used_at`);
    await db.execute(sql`ALTER TABLE staff_users DROP COLUMN must_change_password`);
    const legacySession = await fetch(`${base}/auth/me`, { headers: { cookie } });
    assert.equal(legacySession.status, 200);
    assert.equal((await legacySession.json() as { mustChangePassword: boolean }).mustChangePassword, false);
    assert.equal((await fetch(`${base}/staff-only`, { headers: { cookie } })).status, 200);
    assert.equal((await bootstrap(bootstrapToken)).status, 503);
  } finally {
    restoreEnv();
  }
});
