import assert from "node:assert/strict";
import express from "express";
import test, { after } from "node:test";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import {
  claimHistoryTable,
  claimsTable,
  db,
  donationItemsTable,
  notificationOutboxTable,
  pool,
  recipientAccountsTable,
  stageHistoryTable,
  transferHistoryTable,
  transfersTable,
} from "@workspace/db";
import attendRouter from "../routes/attend";
import { deliverAttendOutbox } from "./attendSheets";

const app = express();
app.use(express.json());
app.use(attendRouter);

type Fixture = {
  accountId: string;
  itemId: string;
  claimId: string;
};

async function startTestServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not expose a TCP address");
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function request(
  baseUrl: string,
  path: string,
  method: "POST" | "PATCH",
  body: unknown,
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function createFixture(): Promise<Fixture> {
  const suffix = randomUUID();
  const fixture = {
    accountId: randomUUID(),
    itemId: randomUUID(),
    claimId: randomUUID(),
  };

  await db.insert(recipientAccountsTable).values({
    id: fixture.accountId,
    name: `Concurrency account ${suffix}`,
    type: "household",
  });
  await db.insert(donationItemsTable).values({
    id: fixture.itemId,
    itemId: `CONCURRENCY-${suffix}`,
    name: "Concurrency test item",
    category: "equipment",
    tier: "T",
    condition: "good",
    donor: "Concurrency test donor",
    lotNumber: `LOT-${suffix}`,
    stage: "storage",
  });
  await db.insert(claimsTable).values({
    id: fixture.claimId,
    accountId: fixture.accountId,
    itemId: fixture.itemId,
    status: "approved",
    submittedBy: "concurrency-test",
    approvedBy: "concurrency-test",
  });

  return fixture;
}

async function removeFixture(fixture: Fixture, transferIds: string[] = []): Promise<void> {
  if (transferIds.length === 0) {
    transferIds = (
      await db
        .select({ id: transfersTable.id })
        .from(transfersTable)
        .where(eq(transfersTable.claimId, fixture.claimId))
    ).map(({ id }) => id);
  }
  await db.delete(notificationOutboxTable).where(
    and(
      eq(notificationOutboxTable.aggregateType, "claim"),
      eq(notificationOutboxTable.aggregateId, fixture.claimId),
    ),
  );
  if (transferIds.length > 0) {
    await db.delete(notificationOutboxTable).where(
      and(
        eq(notificationOutboxTable.aggregateType, "transfer"),
        inArray(notificationOutboxTable.aggregateId, transferIds),
      ),
    );
    await db.delete(transferHistoryTable).where(inArray(transferHistoryTable.transferId, transferIds));
    await db.delete(transfersTable).where(inArray(transfersTable.id, transferIds));
  }
  await db.delete(stageHistoryTable).where(eq(stageHistoryTable.itemId, fixture.itemId));
  await db.delete(claimHistoryTable).where(eq(claimHistoryTable.claimId, fixture.claimId));
  await db.delete(claimsTable).where(eq(claimsTable.id, fixture.claimId));
  await db.delete(donationItemsTable).where(eq(donationItemsTable.id, fixture.itemId));
  await db.delete(recipientAccountsTable).where(eq(recipientAccountsTable.id, fixture.accountId));
}

async function insertReleasedTransfer(fixture: Fixture): Promise<string> {
  const transferId = randomUUID();
  await db.insert(transfersTable).values({
    id: transferId,
    claimId: fixture.claimId,
    accountId: fixture.accountId,
    itemId: fixture.itemId,
    status: "released",
  });
  return transferId;
}

test("parallel transfer creation permits one active transfer and one event", async () => {
  const fixture = await createFixture();
  const server = await startTestServer();
  const body = {
    claimId: fixture.claimId,
    accountId: fixture.accountId,
    itemId: fixture.itemId,
  };

  try {
    const responses = await Promise.all(
      Array.from({ length: 8 }, () => request(server.baseUrl, "/transfers", "POST", body)),
    );
    const statuses = await Promise.all(
      responses.map((response) => response.json() as Promise<{ id?: string }>),
    );
    assert.equal(responses.filter((response) => response.status === 201).length, 1);
    assert.equal(responses.filter((response) => response.status === 409).length, 7);
    assert.equal(statuses.filter((payload) => payload?.id).length, 1);

    const transfers = await db.select().from(transfersTable).where(eq(transfersTable.claimId, fixture.claimId));
    assert.equal(transfers.length, 1);
    const [transfer] = transfers;
    const history = await db.select().from(transferHistoryTable).where(eq(transferHistoryTable.transferId, transfer.id));
    assert.equal(history.filter((entry) => entry.toStatus === "planned").length, 1);
    const events = await db.select().from(notificationOutboxTable).where(
      and(
        eq(notificationOutboxTable.aggregateType, "transfer"),
        eq(notificationOutboxTable.aggregateId, transfer.id),
        eq(notificationOutboxTable.dedupeKey, `transfer:${transfer.id}:planned`),
      ),
    );
    assert.equal(events.length, 1);

    const duplicate = await request(server.baseUrl, "/transfers", "POST", body);
    assert.equal(duplicate.status, 409);
    assert.equal((await db.select().from(transfersTable).where(eq(transfersTable.claimId, fixture.claimId))).length, 1);
    assert.equal((await db.select().from(transferHistoryTable).where(eq(transferHistoryTable.transferId, transfer.id))).length, 1);
    assert.equal((await db.select().from(notificationOutboxTable).where(eq(notificationOutboxTable.dedupeKey, `transfer:${transfer.id}:planned`))).length, 1);

    await removeFixture(fixture, [transfer.id]);
  } catch (error) {
    await removeFixture(fixture);
    throw error;
  } finally {
    await server.close();
  }
});

test("parallel receipt requests write one fulfillment, distribution, and outbox event", async () => {
  const fixture = await createFixture();
  const transferId = await insertReleasedTransfer(fixture);
  const server = await startTestServer();

  try {
    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        request(server.baseUrl, `/transfers/${transferId}/status`, "PATCH", { status: "received" }),
      ),
    );
    assert.equal(responses.filter((response) => response.status === 200).length, 8);
    await Promise.all(responses.map((response) => response.json()));

    const transferHistory = await db.select().from(transferHistoryTable).where(eq(transferHistoryTable.transferId, transferId));
    const claimHistory = await db.select().from(claimHistoryTable).where(eq(claimHistoryTable.claimId, fixture.claimId));
    const stageHistory = await db.select().from(stageHistoryTable).where(eq(stageHistoryTable.itemId, fixture.itemId));
    const receiptEvents = await db.select().from(notificationOutboxTable).where(
      and(
        eq(notificationOutboxTable.aggregateType, "transfer"),
        eq(notificationOutboxTable.aggregateId, transferId),
        eq(notificationOutboxTable.dedupeKey, `transfer:${transferId}:received`),
      ),
    );
    const fulfillmentEvents = await db.select().from(notificationOutboxTable).where(
      and(
        eq(notificationOutboxTable.aggregateType, "claim"),
        eq(notificationOutboxTable.aggregateId, fixture.claimId),
        eq(notificationOutboxTable.dedupeKey, `claim:${fixture.claimId}:fulfilled`),
      ),
    );

    assert.equal(transferHistory.filter((entry) => entry.toStatus === "received").length, 1);
    assert.equal(claimHistory.filter((entry) => entry.toStatus === "fulfilled").length, 1);
    assert.equal(stageHistory.filter((entry) => entry.toStage === "distributed").length, 1);
    assert.equal(receiptEvents.length, 1);
    assert.equal(fulfillmentEvents.length, 1);

    const duplicate = await request(server.baseUrl, `/transfers/${transferId}/status`, "PATCH", { status: "received" });
    assert.equal(duplicate.status, 200);
    assert.equal((await db.select().from(transferHistoryTable).where(eq(transferHistoryTable.transferId, transferId))).filter((entry) => entry.toStatus === "received").length, 1);
    assert.equal((await db.select().from(claimHistoryTable).where(eq(claimHistoryTable.claimId, fixture.claimId))).filter((entry) => entry.toStatus === "fulfilled").length, 1);
    assert.equal((await db.select().from(stageHistoryTable).where(eq(stageHistoryTable.itemId, fixture.itemId))).filter((entry) => entry.toStage === "distributed").length, 1);
    assert.equal((await db.select().from(notificationOutboxTable).where(eq(notificationOutboxTable.dedupeKey, `transfer:${transferId}:received`))).length, 1);
    assert.equal((await db.select().from(notificationOutboxTable).where(eq(notificationOutboxTable.dedupeKey, `claim:${fixture.claimId}:fulfilled`))).length, 1);

    await removeFixture(fixture, [transferId]);
  } catch (error) {
    await removeFixture(fixture, [transferId]);
    throw error;
  } finally {
    await server.close();
  }
});

test("parallel outbox delivery leases append one row", async () => {
  const outboxId = randomUUID();
  const dedupeKey = `concurrency-test:${outboxId}`;
  await db.insert(notificationOutboxTable).values({
    id: outboxId,
    eventType: "concurrency.test",
    aggregateType: "test",
    aggregateId: outboxId,
    dedupeKey,
    payload: JSON.stringify({ outboxId }),
  });

  let appendCount = 0;
  const adapter = {
    async append(_row: readonly string[]): Promise<void> {
      appendCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 25));
    },
  };

  try {
    await Promise.all(Array.from({ length: 8 }, () => deliverAttendOutbox(outboxId, adapter)));
    assert.equal(appendCount, 1);
    const [message] = await db.select().from(notificationOutboxTable).where(eq(notificationOutboxTable.id, outboxId));
    assert.equal(message.status, "sent");
    assert.equal(message.attempts, 1);
  } finally {
    await db.delete(notificationOutboxTable).where(eq(notificationOutboxTable.id, outboxId));
  }
});

after(async () => {
  await pool.end();
});