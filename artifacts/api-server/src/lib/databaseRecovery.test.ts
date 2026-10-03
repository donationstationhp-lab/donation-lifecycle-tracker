import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Socket } from "node:net";
import test from "node:test";
import express from "express";
import {
  createResilientPool, DatabaseConnectionRecovery, DatabaseUnavailableError,
  databaseConnectionErrorCode, isDatabaseConnectionError,
} from "@workspace/db";
import healthRouter from "../routes/health";
import conScireRouter from "../routes/conScire";
import { createDatabaseAvailabilityHandlers } from "../middlewares/databaseAvailability";

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for database state");
    await delay(5);
  }
}

function int32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeInt32BE(value);
  return buffer;
}

function frame(type: string, data: Buffer): Buffer {
  return Buffer.concat([Buffer.from(type), int32(data.length + 4), data]);
}

/**
 * Local PostgreSQL-wire fixture: exercises the real pg Pool without touching
 * the project's database or terminating any real users' connections.
 */
async function postgresFixture() {
  const sockets = new Set<Socket>();
  let mode: "healthy" | "offline" | "terminate-query" | "sql-error" | "silent" = "healthy";
  let queries = 0;
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("error", () => {});
    socket.on("close", () => sockets.delete(socket));
    if (mode === "offline") { socket.destroy(); return; }
    let startup = true;
    let pending = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      pending = Buffer.concat([pending, typeof chunk === "string" ? Buffer.from(chunk) : chunk]);
      while (pending.length >= (startup ? 4 : 5)) {
        const length = pending.readInt32BE(startup ? 0 : 1) + (startup ? 0 : 1);
        if (pending.length < length) return;
        const packet = pending.subarray(0, length);
        pending = pending.subarray(length);
        if (startup) {
          startup = false;
          socket.write(Buffer.concat([
            frame("R", int32(0)),
            frame("K", Buffer.concat([int32(123), int32(456)])),
            frame("Z", Buffer.from("I")),
          ]));
          continue;
        }
        const type = packet.toString("utf8", 0, 1);
        if (type === "X") { socket.end(); continue; }
        if (type !== "Q") throw new Error(`Unexpected test query protocol ${type}`);
        queries += 1;
        if (mode === "silent") continue;
        if (mode === "terminate-query" || mode === "sql-error") {
          const connectionError = mode === "terminate-query";
          socket.write(frame("E", Buffer.from(
            `S${connectionError ? "FATAL" : "ERROR"}\0C${connectionError ? "57P01" : "23505"}\0M${connectionError ? "terminating connection due to administrator command" : "unique violation"}\0\0`,
          )));
          if (connectionError) socket.end();
          else socket.write(frame("Z", Buffer.from("I")));
          continue;
        }
        const column = Buffer.concat([
          Buffer.from([0, 1]), Buffer.from("value\0"), int32(0),
          Buffer.from([0, 0]), int32(23), Buffer.from([0, 4]),
          int32(-1), Buffer.from([0, 0]),
        ]);
        socket.write(Buffer.concat([
          frame("T", column),
          frame("D", Buffer.concat([Buffer.from([0, 1]), int32(1), Buffer.from("1")])),
          frame("C", Buffer.from("SELECT 1\0")),
          frame("Z", Buffer.from("I")),
        ]));
      }
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return {
    port: address.port,
    get queries() { return queries; },
    setMode(value: typeof mode) { mode = value; },
    disconnect() { for (const socket of sockets) socket.destroy(); },
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

test("classifies wrapped connection failures without hiding SQL/domain errors", () => {
  for (const code of ["57P01", "57P02", "57P03", "08006", "ECONNREFUSED", "EAI_AGAIN", "53300"]) {
    assert.equal(databaseConnectionErrorCode({ cause: { cause: { code } } }), code);
  }
  for (const error of [
    { code: "23505" }, { code: "42P01" }, new Error("Invalid appointment"),
    new Error("Notion connection failed"),
  ]) assert.equal(isDatabaseConnectionError(error), false);
  assert.equal(isDatabaseConnectionError(new Error("Query read timeout")), true);
  const cycle: { cause?: unknown } = {};
  cycle.cause = cycle;
  assert.equal(isDatabaseConnectionError(cycle), false);
});

test("recovery is single-flight, exponential, capped, and resets after success", async () => {
  let succeeds = false;
  let attempts = 0;
  let active = 0;
  let maxActive = 0;
  const retryDelays: number[] = [];
  const connection = new DatabaseConnectionRecovery(async (beforeReady) => {
    attempts++;
    maxActive = Math.max(maxActive, ++active);
    await delay(2);
    active--;
    if (!succeeds) throw { code: "ECONNREFUSED" };
    await beforeReady();
  }, 5, 20);
  connection.on("retry", ({ retryInMs }: { retryInMs: number }) => retryDelays.push(retryInMs));
  try {
    for (let i = 0; i < 100; i++) connection.reportFailure({ code: "ECONNRESET" });
    assert.throws(() => connection.assertAvailable(), DatabaseUnavailableError);
    await waitFor(() => attempts >= 4 && retryDelays.length >= 4);
    assert.deepEqual(retryDelays.slice(0, 4), [10, 20, 20, 20]);
    assert.equal(maxActive, 1);
    succeeds = true;
    await waitFor(() => connection.isAvailable);
    connection.reportFailure({ code: "ECONNRESET" });
    assert.equal(connection.retryAfterSeconds, 1);
    await waitFor(() => connection.isAvailable);
  } finally { connection.stop(); }
  const stoppedAt = attempts;
  await delay(30);
  assert.equal(attempts, stoppedAt);
});

test("real pg idle disconnection keeps HTTP alive, returns 503, and recovers automatically", async () => {
  const fixture = await postgresFixture();
  const { pool, connection } = createResilientPool({
    host: "127.0.0.1", port: fixture.port, user: "test", database: "test", ssl: false,
    connectionTimeoutMillis: 100,
  });
  const { requireDatabase, databaseErrorHandler } = createDatabaseAvailabilityHandlers(connection);
  const app = express();
  app.use("/api", healthRouter);
  app.get("/healthz", (_req, res) => { res.json({ status: "ok" }); });
  app.use("/api", conScireRouter);
  app.get("/api/test-db", requireDatabase, async (_req, res) => {
    const result = await pool.query("SELECT 1");
    res.json(result.rows);
  });
  app.use(databaseErrorHandler);
  const http = app.listen(0);
  await once(http, "listening");
  const address = http.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  let initializations = 0;
  connection.setBeforeReady(async () => {
    await pool.query("SELECT 1");
    initializations++;
  });
  try {
    assert.equal((await fetch(`${base}/api/test-db`)).status, 200);
    fixture.setMode("offline");
    fixture.disconnect(); // real idle pg-client socket error (the original crash)
    await waitFor(() => !connection.isAvailable);
    for (const path of ["/healthz", "/api", "/api/healthz", "/api/con-scire/windows?days=1"]) {
      assert.equal((await fetch(`${base}${path}`)).status, 200, path);
    }
    const queriesBefore = fixture.queries;
    const response = await fetch(`${base}/api/test-db`);
    assert.equal(response.status, 503);
    assert.ok(Number(response.headers.get("retry-after")) >= 1);
    assert.deepEqual(await response.json(), {
      error: "Database temporarily unavailable. Please try again shortly.",
      code: "DATABASE_UNAVAILABLE",
    });
    assert.equal(fixture.queries, queriesBefore, "outage gate must not issue more queries");
    await assert.rejects(pool.query("SELECT 1"), DatabaseUnavailableError);
    await assert.rejects(pool.connect(), DatabaseUnavailableError);
    await new Promise<void>((resolve) => {
      pool.query("SELECT 1", (error) => {
        assert.ok(error instanceof DatabaseUnavailableError);
        resolve();
      });
    });
    fixture.setMode("healthy");
    await waitFor(() => connection.isAvailable);
    assert.equal(initializations, 1, "maintenance can initialize before re-enabling DB requests");
    assert.equal((await fetch(`${base}/api/test-db`)).status, 200);
    assert.equal((await pool.query("SELECT 1")).rows[0].value, 1);
    // A failure in the first request is also mapped to 503, before the gate knows.
    fixture.setMode("terminate-query");
    assert.equal((await fetch(`${base}/api/test-db`)).status, 503);
    fixture.setMode("healthy");
    await waitFor(() => connection.isAvailable);
    const client = await pool.connect();
    try {
      fixture.setMode("sql-error");
      await assert.rejects(client.query("SELECT 1"), { code: "23505" });
      assert.equal(connection.isAvailable, true, "SQL conflicts are not outages");
      fixture.setMode("terminate-query");
      await assert.rejects(client.query("SELECT 1"), { code: "57P01" });
      assert.equal(connection.isAvailable, false, "transaction-client errors also trigger recovery");
    } finally { client.release(true); }
    fixture.setMode("healthy");
    await waitFor(() => connection.isAvailable);
  } finally {
    await pool.end();
    await new Promise<void>((resolve, reject) => http.close((error) => error ? reject(error) : resolve()));
    await fixture.close();
  }
});

test("unavailable on first connection and silent query timeout both recover without restart", async () => {
  const fixture = await postgresFixture();
  fixture.setMode("offline");
  const { pool, connection } = createResilientPool({
    host: "127.0.0.1", port: fixture.port, user: "test", database: "test", ssl: false,
    connectionTimeoutMillis: 100, query_timeout: 50,
  });
  try {
    await assert.rejects(pool.query("SELECT 1"));
    assert.equal(connection.isAvailable, false);
    fixture.setMode("healthy");
    await waitFor(() => connection.isAvailable);
    fixture.setMode("silent");
    await assert.rejects(pool.query("SELECT 1"), { message: "Query read timeout" });
    assert.equal(connection.isAvailable, false);
    fixture.setMode("healthy");
    await waitFor(() => connection.isAvailable);
    await new Promise<void>((resolve, reject) => {
      pool.connect((error, client, release) => {
        if (error) { reject(error); return; }
        assert.ok(client);
        client.query("SELECT 1", (queryError, result) => {
          release(queryError ?? undefined);
          if (queryError) reject(queryError);
          else { assert.equal(result.rows[0].value, 1); resolve(); }
        });
      });
    });
  } finally {
    await pool.end();
    await fixture.close();
  }
});