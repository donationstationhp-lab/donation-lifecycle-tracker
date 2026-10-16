import assert from "node:assert/strict";
import test, { after } from "node:test";
import { randomUUID } from "node:crypto";
import express from "express";
import type { ReplitConnectors } from "@replit/connectors-sdk";
import { eq } from "drizzle-orm";
import { attendDeliveryAlertsTable, db, notificationOutboxTable, pool } from "@workspace/db";
import attendRouter from "../routes/attend";
import {
  canClaimOutboxLease,
  deliverAttendOutbox,
  queueAttendSheetAppend,
  retryAttendOutboxBatch,
  sanitizeAttendDeliveryError,
  withAttendSheetAppendLock,
  GoogleSheetsAttendAdapter,
} from "./attendSheets";

after(async () => {
  await pool.end();
});

test("sheet-side dedupe: normal append, lost response retry, and existing duplicate rows", async (t) => {
  for (const mode of ["normal", "lost-response", "existing-duplicates"] as const) {
    await t.test(mode, async () => {
      const id = randomUUID();
      const key = `attend-idempotency-test:${id}`;
      const row = [id, "claim.submitted", "claim", id, key, "{}", "2026-10-16T00:00:00Z"];
      const saved: string[][] = mode === "existing-duplicates" ? [[...row], [...row]] : [];
      let appendCalls = 0;
      let lookupCalls = 0;
      let now = new Date("2037-10-16T00:00:00Z");
      const proxy = {
        async proxy(_connector: string, path: string, options: { method: string; body?: { values: string[][] } }) {
          if (options.method === "GET") {
            lookupCalls++;
            assert.ok(path.includes("/values/"));
            return Response.json({ values: saved });
          }
          assert.equal(options.method, "POST");
          assert.ok(path.includes(":append"));
          appendCalls++;
          saved.push(...options.body!.values);
          // The external write succeeded, but its response never reached us.
          if (mode === "lost-response" && appendCalls === 1) throw new Error("lost response");
          return Response.json({ updates: { updatedRows: 1 } });
        },
      };
      const adapter = new GoogleSheetsAttendAdapter(proxy as unknown as ReplitConnectors,
        { spreadsheetId: "synthetic-sheet", range: "'ATTEND Events'!A:G" });
      await db.insert(notificationOutboxTable).values({
        id, eventType: "claim.submitted", aggregateType: "claim", aggregateId: id,
        dedupeKey: key, payload: "{}",
      });
      try {
        const options = { now: () => now, retryBaseDelayMs: 100 };
        await deliverAttendOutbox(id, adapter, options);
        if (mode === "lost-response") {
          const [failed] = await db.select().from(notificationOutboxTable).where(eq(notificationOutboxTable.id, id));
          assert.equal(failed.status, "failed");
          assert.equal(saved.length, 1);
          now = new Date(now.getTime() + 100);
          await deliverAttendOutbox(id, adapter, options);
        }
        const [sent] = await db.select().from(notificationOutboxTable).where(eq(notificationOutboxTable.id, id));
        assert.equal(sent.status, "sent");
        assert.equal(sent.lastError, null);
        assert.equal(sent.attempts, mode === "lost-response" ? 2 : 1);
        assert.equal(lookupCalls, mode === "lost-response" ? 2 : 1);
        assert.equal(appendCalls, mode === "existing-duplicates" ? 0 : 1);
        assert.equal(saved.length, mode === "existing-duplicates" ? 2 : 1);
        assert.ok(saved.every((r) => r[4] === key));
      } finally {
        await db.delete(notificationOutboxTable).where(eq(notificationOutboxTable.id, id));
      }
    });
  }
});

test("a failed sheet dedupe lookup fails closed without appending", async () => {
  let appends = 0;
  const proxy = {
    async proxy(_connector: string, _path: string, options: { method: string }) {
      if (options.method === "GET") return new Response("", { status: 401 });
      appends++;
      return Response.json({});
    },
  };
  const adapter = new GoogleSheetsAttendAdapter(proxy as unknown as ReplitConnectors, { spreadsheetId: "synthetic-sheet" });
  await assert.rejects(adapter.append(["id", "claim.submitted", "claim", "id", "key", "{}", "date"]), /lookup failed \(401\)/);
  assert.equal(appends, 0);
});

test("only pending or failed outbox records are eligible for an append lease", () => {
  assert.equal(canClaimOutboxLease("pending"), true);
  assert.equal(canClaimOutboxLease("failed"), true);
  assert.equal(canClaimOutboxLease("processing"), false);
  assert.equal(canClaimOutboxLease("sent"), false);
});

test("successful delivery records the send and clears retry metadata", async () => {
  const id = randomUUID();
  const now = new Date("2026-08-30T12:00:00.000Z");
  await db.insert(notificationOutboxTable).values({
    id,
    eventType: "claim.submitted",
    aggregateType: "claim",
    aggregateId: id,
    dedupeKey: `attend-test:${id}`,
    payload: JSON.stringify({ id }),
  });

  try {
    await deliverAttendOutbox(id, { append: async () => undefined }, {
      now: () => now,
      leaseDurationMs: 1_000,
    });
    const [message] = await db.select().from(notificationOutboxTable).where(eq(notificationOutboxTable.id, id));
    assert.equal(message.status, "sent");
    assert.equal(message.attempts, 1);
    assert.equal(message.lastError, null);
    assert.equal(message.nextRetryAt, null);
    assert.equal(message.processingLeaseUntil, null);
    assert.equal(message.sentAt?.toISOString(), now.toISOString());
  } finally {
    await db.delete(notificationOutboxTable).where(eq(notificationOutboxTable.id, id));
  }
});

test("transient delivery failure schedules bounded exponential retry", async () => {
  const id = randomUUID();
  let current = new Date("2036-08-30T12:00:00.000Z");
  let appendCount = 0;
  await db.insert(notificationOutboxTable).values({
    id,
    eventType: "claim.submitted",
    aggregateType: "claim",
    aggregateId: id,
    dedupeKey: `attend-test:${id}`,
    payload: JSON.stringify({ id }),
  });

  const adapter = {
    async append(): Promise<void> {
      appendCount += 1;
      if (appendCount === 1) throw new Error("temporary Sheets outage");
    },
  };
  const options = {
    now: () => current,
    retryBaseDelayMs: 100,
    retryMaxDelayMs: 500,
    leaseDurationMs: 1_000,
  };

  try {
    await deliverAttendOutbox(id, adapter, options);
    let [message] = await db.select().from(notificationOutboxTable).where(eq(notificationOutboxTable.id, id));
    assert.equal(message.status, "failed");
    assert.equal(message.attempts, 1);
    assert.equal(message.lastError, "temporary Sheets outage");
    assert.equal(message.nextRetryAt?.toISOString(), "2036-08-30T12:00:00.100Z");

    await deliverAttendOutbox(id, adapter, options);
    assert.equal(appendCount, 1);

    current = new Date("2036-08-30T12:00:00.100Z");
    await deliverAttendOutbox(id, adapter, options);
    [message] = await db.select().from(notificationOutboxTable).where(eq(notificationOutboxTable.id, id));
    assert.equal(appendCount, 2);
    assert.equal(message.status, "sent");
    assert.equal(message.attempts, 2);
    assert.equal(message.lastError, null);
  } finally {
    await db.delete(notificationOutboxTable).where(eq(notificationOutboxTable.id, id));
  }
});

test("exhausted delivery failure is not retried again", async () => {
  const id = randomUUID();
  let appendCount = 0;
  await db.insert(notificationOutboxTable).values({
    id,
    eventType: "claim.submitted",
    aggregateType: "claim",
    aggregateId: id,
    dedupeKey: `attend-test:${id}`,
    payload: JSON.stringify({ id }),
  });

  try {
    await deliverAttendOutbox(id, {
      async append(): Promise<void> {
        appendCount += 1;
        throw new Error("permanent Sheets outage");
      },
    }, {
      maxAttempts: 1,
      retryBaseDelayMs: 100,
      leaseDurationMs: 1_000,
    });
    const [message] = await db.select().from(notificationOutboxTable).where(eq(notificationOutboxTable.id, id));
    assert.equal(appendCount, 1);
    assert.equal(message.status, "failed");
    assert.equal(message.attempts, 1);
    assert.equal(message.nextRetryAt, null);
    assert.equal(message.lastError, "permanent Sheets outage");
    const alerts = await db.select().from(attendDeliveryAlertsTable).where(eq(attendDeliveryAlertsTable.outboxId, id));
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].eventType, "claim.submitted");
    assert.equal(alerts[0].aggregateId, id);
    assert.equal(alerts[0].lastError, "permanent Sheets outage");

    await deliverAttendOutbox(id, {
      async append(): Promise<void> {
        appendCount += 1;
      },
    }, { maxAttempts: 1, leaseDurationMs: 1_000 });
    assert.equal(appendCount, 1);
    assert.equal((await db.select().from(attendDeliveryAlertsTable).where(eq(attendDeliveryAlertsTable.outboxId, id))).length, 1);
  } finally {
    await db.delete(notificationOutboxTable).where(eq(notificationOutboxTable.id, id));
  }
});

test("final delivery alert sanitizes sensitive error details and is deduplicated across scans", async () => {
  const id = randomUUID();
  const now = new Date("2036-08-30T12:00:00.000Z");
  await db.insert(notificationOutboxTable).values({
    id,
    eventType: "transfer.released",
    aggregateType: "transfer",
    aggregateId: "transfer-123",
    dedupeKey: `attend-test:${id}`,
    payload: JSON.stringify({ donorPhone: "555-0100" }),
  });

  try {
    await deliverAttendOutbox(id, {
      async append(): Promise<void> {
        throw new Error(
          "connector response payload={donorPhone:555-0100} spreadsheetId=sheet-secret access_token=token-secret",
        );
      },
    }, { now: () => now, maxAttempts: 1, leaseDurationMs: 1_000 });

    const [alert] = await db.select().from(attendDeliveryAlertsTable).where(eq(attendDeliveryAlertsTable.outboxId, id));
    assert.ok(alert);
    assert.equal(alert.eventType, "transfer.released");
    assert.equal(alert.aggregateType, "transfer");
    assert.equal(alert.aggregateId, "transfer-123");
    assert.match(alert.lastError, /delivery service/);
    assert.doesNotMatch(alert.lastError, /connector|donorPhone|555-0100|sheet-secret|token-secret|payload=|spreadsheetId=|access_token=/);

    await retryAttendOutboxBatch({
      now: () => now,
      maxAttempts: 1,
      batchSize: 10,
      adapter: { append: async () => undefined },
    });
    assert.equal((await db.select().from(attendDeliveryAlertsTable).where(eq(attendDeliveryAlertsTable.outboxId, id))).length, 1);
  } finally {
    await db.delete(notificationOutboxTable).where(eq(notificationOutboxTable.id, id));
  }
});

test("error sanitizer has a safe fallback for non-Error values", () => {
  assert.equal(sanitizeAttendDeliveryError(null), "Unknown ATTEND delivery error");
  assert.equal(
    sanitizeAttendDeliveryError("request failed token=secret https://example.test/private"),
    "request failed [redacted detail] [redacted URL]",
  );
});

test("expired processing lease can be recovered by another worker", async () => {
  const id = randomUUID();
  const now = new Date("2026-08-30T12:00:00.000Z");
  await db.insert(notificationOutboxTable).values({
    id,
    eventType: "claim.submitted",
    aggregateType: "claim",
    aggregateId: id,
    dedupeKey: `attend-test:${id}`,
    payload: JSON.stringify({ id }),
    status: "processing",
    attempts: 1,
    processingLeaseUntil: new Date("2026-08-30T11:59:00.000Z"),
  });

  try {
    await deliverAttendOutbox(id, { append: async () => undefined }, {
      now: () => now,
      leaseDurationMs: 1_000,
    });
    const [message] = await db.select().from(notificationOutboxTable).where(eq(notificationOutboxTable.id, id));
    assert.equal(message.status, "sent");
    assert.equal(message.attempts, 2);
  } finally {
    await db.delete(notificationOutboxTable).where(eq(notificationOutboxTable.id, id));
  }
});

test("legacy processing row without lease metadata is recovered", async () => {
  const id = randomUUID();
  const now = new Date("2026-08-30T12:00:00.000Z");
  let appendCount = 0;
  await db.insert(notificationOutboxTable).values({
    id,
    eventType: "claim.submitted",
    aggregateType: "claim",
    aggregateId: id,
    dedupeKey: `attend-test:${id}`,
    payload: JSON.stringify({ id }),
    status: "processing",
    attempts: 1,
    processingLeaseUntil: null,
    processingLeaseToken: null,
  });

  try {
    await retryAttendOutboxBatch({
      adapter: {
        async append(): Promise<void> {
          appendCount += 1;
        },
      },
      now: () => now,
      leaseDurationMs: 1_000,
      batchSize: 10,
    });
    const [message] = await db.select().from(notificationOutboxTable).where(eq(notificationOutboxTable.id, id));
    assert.equal(appendCount, 1);
    assert.equal(message.status, "sent");
    assert.equal(message.attempts, 2);
    assert.equal(message.processingLeaseUntil, null);
    assert.equal(message.processingLeaseToken, null);
  } finally {
    await db.delete(notificationOutboxTable).where(eq(notificationOutboxTable.id, id));
  }
});

test("expired final-attempt lease becomes exhausted instead of exceeding the retry cap", async () => {
  const id = randomUUID();
  const now = new Date("2026-08-30T12:00:00.000Z");
  let appendCount = 0;
  await db.insert(notificationOutboxTable).values({
    id,
    eventType: "claim.submitted",
    aggregateType: "claim",
    aggregateId: id,
    dedupeKey: `attend-test:${id}`,
    payload: JSON.stringify({ id }),
    status: "processing",
    attempts: 1,
    processingLeaseUntil: new Date("2026-08-30T11:59:00.000Z"),
    processingLeaseToken: randomUUID(),
  });

  try {
    await retryAttendOutboxBatch({
      adapter: {
      async append(): Promise<void> {
        appendCount += 1;
      },
      },
      now: () => now,
      maxAttempts: 1,
      leaseDurationMs: 1_000,
      batchSize: 10,
    });
    const [message] = await db.select().from(notificationOutboxTable).where(eq(notificationOutboxTable.id, id));
    assert.equal(appendCount, 0);
    assert.equal(message.status, "failed");
    assert.equal(message.attempts, 1);
    assert.equal(message.nextRetryAt, null);
    assert.equal(message.processingLeaseUntil, null);
    assert.equal(message.processingLeaseToken, null);
    assert.equal(message.lastError, "Delivery lease expired after final attempt");
    assert.equal(
      (await db.select().from(attendDeliveryAlertsTable).where(eq(attendDeliveryAlertsTable.outboxId, id))).length,
      1,
    );
  } finally {
    await db.delete(notificationOutboxTable).where(eq(notificationOutboxTable.id, id));
  }
});

test("direct delivery alerts an expired final-attempt lease exactly once", async () => {
  const id = randomUUID();
  const now = new Date("2026-08-30T12:00:00.000Z");
  let appendCount = 0;
  await db.insert(notificationOutboxTable).values({
    id,
    eventType: "transfer.released",
    aggregateType: "transfer",
    aggregateId: "transfer-expired",
    dedupeKey: `attend-test:${id}`,
    payload: JSON.stringify({ id }),
    status: "processing",
    attempts: 1,
    processingLeaseUntil: new Date("2026-08-30T11:59:00.000Z"),
    processingLeaseToken: randomUUID(),
  });

  const adapter = {
    async append(): Promise<void> {
      appendCount += 1;
    },
  };
  const options = { now: () => now, maxAttempts: 1, leaseDurationMs: 1_000 };

  try {
    await deliverAttendOutbox(id, adapter, options);
    await deliverAttendOutbox(id, adapter, options);

    assert.equal(appendCount, 0);
    const [message] = await db.select().from(notificationOutboxTable).where(eq(notificationOutboxTable.id, id));
    assert.equal(message.status, "failed");
    assert.equal(message.lastError, "Delivery lease expired after final attempt");
    const alerts = await db.select().from(attendDeliveryAlertsTable).where(eq(attendDeliveryAlertsTable.outboxId, id));
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].eventType, "transfer.released");
    assert.equal(alerts[0].aggregateId, "transfer-expired");
  } finally {
    await db.delete(notificationOutboxTable).where(eq(notificationOutboxTable.id, id));
  }
});

test("lease expiry during a slow append does not allow a second worker to append", async () => {
  const id = randomUUID();
  let current = new Date("2026-08-30T12:00:00.000Z");
  let appendCount = 0;
  let releaseAppend: (() => void) | undefined;
  let resolveStarted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    resolveStarted = resolve;
  });
  const release = new Promise<void>((resolve) => {
    releaseAppend = resolve;
  });
  await db.insert(notificationOutboxTable).values({
    id,
    eventType: "claim.submitted",
    aggregateType: "claim",
    aggregateId: id,
    dedupeKey: `attend-test:${id}`,
    payload: JSON.stringify({ id }),
  });

  const first = deliverAttendOutbox(id, {
    async append(): Promise<void> {
      appendCount += 1;
      resolveStarted?.();
      await release;
    },
  }, {
    now: () => current,
    leaseDurationMs: 10,
  });

  try {
    await started;
    current = new Date("2026-08-30T12:00:00.020Z");
    const second = deliverAttendOutbox(id, {
      async append(): Promise<void> {
        appendCount += 1;
      },
    }, {
      now: () => current,
      leaseDurationMs: 10,
    });
    releaseAppend?.();
    await Promise.all([first, second]);
    const [message] = await db.select().from(notificationOutboxTable).where(eq(notificationOutboxTable.id, id));
    assert.equal(appendCount, 1);
    assert.equal(message.status, "sent");
    assert.equal(message.attempts, 1);
  } finally {
    releaseAppend?.();
    await first;
    await db.delete(notificationOutboxTable).where(eq(notificationOutboxTable.id, id));
  }
});

test("operator status exposes retry details without exposing event payload", async () => {
  const id = randomUUID();
  const app = express();
  app.use(attendRouter);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not expose a TCP address");
  await db.insert(notificationOutboxTable).values({
    id,
    eventType: "claim.submitted",
    aggregateType: "claim",
    aggregateId: id,
    dedupeKey: `attend-test:${id}`,
    payload: JSON.stringify({ privateEventDetail: "not-for-status-response" }),
    status: "failed",
    attempts: 1,
    lastError: "Google Sheets append failed (503)",
    nextRetryAt: new Date("2026-08-30T12:00:30.000Z"),
  });

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/attend/outbox`);
    assert.equal(response.status, 200);
    const entries = await response.json() as Array<Record<string, unknown>>;
    const message = entries.find((entry) => entry.id === id);
    assert.ok(message);
    assert.equal(message.lastError, "Google Sheets append failed (503)");
    assert.equal(message.nextRetryAt, "2026-08-30T12:00:30.000Z");
    assert.equal("payload" in message, false);
    assert.equal("spreadsheetId" in message, false);
  } finally {
    await db.delete(notificationOutboxTable).where(eq(notificationOutboxTable.id, id));
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});

test("ATTEND delivery alert listing and acknowledgement are supervisor-only and return safe audit data", async () => {
  const outboxId = randomUUID();
  const alertId = randomUUID();
  const app = express();
  app.use((req, res, next) => {
    const role = req.headers["x-test-role"];
    res.locals.staffRole = role === "supervisor" ? "supervisor" : "staff";
    res.locals.staffUserId = role === "supervisor" ? "supervisor-user-123" : "staff-user-123";
    res.locals.authMethod = "clerk";
    next();
  });
  app.use(attendRouter);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not expose a TCP address");
  await db.insert(notificationOutboxTable).values({
    id: outboxId,
    eventType: "claim.submitted",
    aggregateType: "claim",
    aggregateId: outboxId,
    dedupeKey: `attend-test:${outboxId}`,
    payload: JSON.stringify({
      privateEventDetail: "not-for-alert-response",
      accessToken: "credential-not-for-alert-response",
    }),
  });
  await db.insert(attendDeliveryAlertsTable).values({
    id: alertId,
    outboxId,
    eventType: "claim.submitted",
    aggregateType: "claim",
    aggregateId: outboxId,
    lastError: "Delivery failed",
    dedupeKey: `attend-delivery-failed:${outboxId}`,
  });

  try {
    const baseUrl = `http://127.0.0.1:${address.port}/attend/alerts`;
    const staffListResponse = await fetch(baseUrl, {
      headers: { "x-test-role": "staff" },
    });
    assert.equal(staffListResponse.status, 403);

    const staffAcknowledgeResponse = await fetch(`${baseUrl}/${alertId}`, {
      method: "PATCH",
      headers: { "x-test-role": "staff" },
    });
    assert.equal(staffAcknowledgeResponse.status, 403);

    const supervisorListResponse = await fetch(baseUrl, {
      headers: { "x-test-role": "supervisor" },
    });
    assert.equal(supervisorListResponse.status, 200);
    const alertPage = await supervisorListResponse.json() as {
      items: Array<Record<string, unknown>>;
      page: number;
      pageSize: number;
      totalItems: number;
      totalPages: number;
      hasPreviousPage: boolean;
      hasNextPage: boolean;
    };
    assert.equal(alertPage.page, 1);
    assert.equal(alertPage.pageSize, 20);
    assert.equal(alertPage.hasPreviousPage, false);
    const listedAlert = alertPage.items.find((entry) => entry.id === alertId);
    assert.ok(listedAlert);
    assert.equal(listedAlert.acknowledgedAt, null);
    assert.deepEqual(Object.keys(listedAlert).sort(), ["acknowledgedAt", "createdAt", "id"]);
    assert.equal("payload" in listedAlert, false);
    assert.equal("accessToken" in listedAlert, false);
    assert.equal("lastError" in listedAlert, false);
    assert.equal("outboxId" in listedAlert, false);
    assert.doesNotMatch(JSON.stringify(listedAlert), /not-for-alert-response|credential-not-for-alert-response/);

    const openResponse = await fetch(`${baseUrl}?acknowledgement=open&page=1&pageSize=1`, {
      headers: { "x-test-role": "supervisor" },
    });
    assert.equal(openResponse.status, 200);
    const openPage = await openResponse.json() as { items: Array<Record<string, unknown>>; pageSize: number };
    assert.equal(openPage.pageSize, 1);
    assert.ok(openPage.items.some((entry) => entry.id === alertId));

    const supervisorAcknowledgeResponse = await fetch(`${baseUrl}/${alertId}`, {
      method: "PATCH",
      headers: { "x-test-role": "supervisor" },
    });
    assert.equal(supervisorAcknowledgeResponse.status, 200);
    const acknowledged = await supervisorAcknowledgeResponse.json() as Record<string, unknown>;
    assert.equal(acknowledged.id, alertId);
    assert.equal(acknowledged.acknowledgedBy, "supervisor-user-123");
    assert.equal(typeof acknowledged.acknowledgedAt, "string");
    assert.equal("payload" in acknowledged, false);
    assert.equal("accessToken" in acknowledged, false);
    assert.doesNotMatch(JSON.stringify(acknowledged), /not-for-alert-response|credential-not-for-alert-response/);

    const acknowledgedResponse = await fetch(
      `${baseUrl}?acknowledgement=acknowledged&createdFrom=2020-01-01T00:00:00.000Z&createdTo=2030-01-01T00:00:00.000Z`,
      { headers: { "x-test-role": "supervisor" } },
    );
    assert.equal(acknowledgedResponse.status, 200);
    const acknowledgedPage = await acknowledgedResponse.json() as { items: Array<Record<string, unknown>> };
    assert.ok(acknowledgedPage.items.some((entry) => entry.id === alertId));

    const invalidRangeResponse = await fetch(
      `${baseUrl}?createdFrom=2030-01-01T00:00:00.000Z&createdTo=2020-01-01T00:00:00.000Z`,
      { headers: { "x-test-role": "supervisor" } },
    );
    assert.equal(invalidRangeResponse.status, 400);

    const storedAlerts = await db
      .select()
      .from(attendDeliveryAlertsTable)
      .where(eq(attendDeliveryAlertsTable.id, alertId));
    assert.equal(storedAlerts.length, 1);
    assert.equal(storedAlerts[0].id, alertId);
    assert.equal(storedAlerts[0].outboxId, outboxId);
    assert.equal(storedAlerts[0].acknowledgedBy, "supervisor-user-123");
    assert.ok(storedAlerts[0].acknowledgedAt);
  } finally {
    await db.delete(notificationOutboxTable).where(eq(notificationOutboxTable.id, outboxId));
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});

test("sheet appends are serialized to avoid concurrent table-boundary collisions", async () => {
  let active = 0;
  let maxActive = 0;
  const order: string[] = [];
  const adapter = {
    async append(row: readonly string[]) {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push(row[0] ?? "");
      active -= 1;
    },
  };

  await Promise.all([
    queueAttendSheetAppend(adapter, ["first"]),
    queueAttendSheetAppend(adapter, ["second"]),
  ]);

  assert.equal(maxActive, 1);
  assert.deepEqual(order, ["first", "second"]);
});

test("PostgreSQL coordinates sheet appends across concurrent delivery sessions", async () => {
  let active = 0;
  let maxActive = 0;

  await Promise.all([
    withAttendSheetAppendLock(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active -= 1;
    }),
    withAttendSheetAppendLock(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active -= 1;
    }),
  ]);

  assert.equal(maxActive, 1);
});
