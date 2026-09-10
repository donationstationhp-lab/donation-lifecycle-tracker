import assert from "node:assert/strict";
import test, { after } from "node:test";
import { randomUUID } from "node:crypto";
import express from "express";
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
} from "./attendSheets";

after(async () => {
  await pool.end();
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
    const alerts = await supervisorListResponse.json() as Array<Record<string, unknown>>;
    const listedAlert = alerts.find((entry) => entry.id === alertId);
    assert.ok(listedAlert);
    assert.equal(listedAlert.acknowledgedAt, null);
    assert.equal(listedAlert.acknowledgedBy, null);
    assert.equal("payload" in listedAlert, false);
    assert.equal("accessToken" in listedAlert, false);
    assert.doesNotMatch(JSON.stringify(listedAlert), /not-for-alert-response|credential-not-for-alert-response/);

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
