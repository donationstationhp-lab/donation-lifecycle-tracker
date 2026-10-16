import assert from "node:assert/strict";
import express from "express";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import {
  db, donationItemsTable, donorsTable, pickupRequestsTable, trackingCountersTable, agentsTable,
} from "@workspace/db";
import itemsRouter from "./items";
import publicRouter from "./publicRoutes";
import pickupsRouter from "./pickups";
import cliRouter from "./cliExtras";
import {
  allocateItemDsId, formatItemDsId, ITEM_DS_COUNTER_NAME,
  ItemIdCapacityError, MAX_ITEM_DS_NUMBER,
} from "../lib/itemIds";
import { ITEM_PAIRING_POLICY } from "../lib/itemPairingPolicy";
import { isolateTestDatabase } from "../test/databaseIsolation";

const app = express();
app.use(express.json());
app.use(itemsRouter, publicRouter, pickupsRouter, cliRouter);

let cleanupDatabase: () => Promise<void>;
let baseUrl: string;
let closeServer: () => Promise<void>;

test.before(async () => {
  cleanupDatabase = await isolateTestDatabase();
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
  closeServer = () => new Promise<void>((resolve, reject) => {
    server.closeAllConnections();
    server.close((error) => error ? reject(error) : resolve());
  });
});

test.beforeEach(async () => {
  await db.execute(sql`
    TRUNCATE item_snow_history, item_snow, item_external_references,
      item_identity_aliases, notion_item_snapshots, item_identities,
      tracking_counters, donation_items, stage_history, donors,
      pickup_requests, service_activities, donation_submissions, agents, agent_days
  `);
  await db.insert(agentsTable).values({
    id: "fixture-agent", number: 1, fullName: "Synthetic site", shortName: "Site",
    address: "Synthetic address", type: "CIA-provided", status: "active",
  });
});

test.after(async () => {
  if (closeServer) await closeServer();
  if (cleanupDatabase) await cleanupDatabase();
});

function itemValues(itemId: string) {
  return {
    id: randomUUID(), itemId, name: "Synthetic allocation test item",
    category: "equipment", tier: "R", condition: "good",
    donor: "Synthetic test donor", lotNumber: `LOT-${randomUUID()}`,
  };
}

async function setCounter(nextNumber: number) {
  await db.insert(trackingCountersTable).values({
    name: ITEM_DS_COUNTER_NAME, nextNumber,
  }).onConflictDoUpdate({ target: trackingCountersTable.name, set: { nextNumber } });
}

async function nextCounter() {
  const [counter] = await db.select().from(trackingCountersTable)
    .where(eq(trackingCountersTable.name, ITEM_DS_COUNTER_NAME));
  return counter?.nextNumber;
}

function post(path: string, body: unknown) {
  return fetch(baseUrl + path, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(path === "/items" ? { receivingAgentId: "fixture-agent", ...(body as object) } : body),
  });
}

async function seedPickup() {
  const id = randomUUID();
  await db.insert(pickupRequestsTable).values({
    id, status: "dispatched", phone: "synthetic-test-phone",
    name: "Synthetic test donor", address: "Synthetic test location",
    requestedWindow: "Test only", itemsDescribed: "Test donation",
  });
  return id;
}

test("item IDs retain the four-digit format and reject exhaustion", () => {
  assert.equal(formatItemDsId(6), "DS-0006");
  assert.equal(formatItemDsId(9_999), "DS-9999");
  for (const number of [0, -1, 1.5, 10_000, NaN]) {
    assert.throws(() => formatItemDsId(number), ItemIdCapacityError);
  }
});

test("new counter reserves the five known Notion IDs without enabling writes", async () => {
  assert.equal(await db.transaction(allocateItemDsId), "DS-0006");
  assert.equal(await db.transaction(allocateItemDsId), "DS-0007");
  assert.equal(ITEM_PAIRING_POLICY.notionWritesEnabled, false);
  assert.equal(ITEM_PAIRING_POLICY.requireIdentityImportBeforeNotionWrites, true);
  assert.equal(await nextCounter(), 8);
});

test("missing and stale counters advance past historical IDs without changing them", async () => {
  const existing = [
    itemValues("DS-0005"), itemValues("DS-8700"),
    itemValues("DS-08701"), itemValues("LEGACY-NONNUMERIC"),
  ];
  await db.insert(donationItemsTable).values(existing);
  assert.equal(await db.transaction(allocateItemDsId), "DS-8702");
  await setCounter(2);
  assert.equal(await db.transaction(allocateItemDsId), "DS-8702");
  const saved = await db.select().from(donationItemsTable);
  assert.deepEqual(saved.map((item) => item.itemId).sort(), existing.map((item) => item.itemId).sort());
});

test("counter never moves backwards when higher items have been removed", async () => {
  await setCounter(9_500);
  assert.equal(await db.transaction(allocateItemDsId), "DS-9500");
  assert.equal(await nextCounter(), 9_501);
});

test("failed item transactions roll back allocation together with the item", async () => {
  const rollback = new Error("intentional test rollback");
  await assert.rejects(db.transaction(async (tx) => {
    const itemId = await allocateItemDsId(tx);
    await tx.insert(donationItemsTable).values(itemValues(itemId));
    throw rollback;
  }), (error) => error === rollback);
  assert.equal(await nextCounter(), undefined);
  assert.equal((await db.select().from(donationItemsTable)).length, 0);
  assert.equal(await db.transaction(allocateItemDsId), "DS-0006");
});

test("concurrent transactions issue unique consecutive IDs and preserve the claim counter", async () => {
  await db.insert(trackingCountersTable).values({ name: "claim", nextNumber: 123 });
  const ids = await Promise.all(Array.from({ length: 16 }, () =>
    db.transaction(async (tx) => {
      const itemId = await allocateItemDsId(tx);
      await tx.insert(donationItemsTable).values(itemValues(itemId));
      return itemId;
    }),
  ));
  assert.equal(new Set(ids).size, 16);
  assert.deepEqual(ids.sort(), Array.from({ length: 16 }, (_, i) => formatItemDsId(i + 6)));
  assert.equal(await nextCounter(), 22);
  const [claim] = await db.select().from(trackingCountersTable)
    .where(eq(trackingCountersTable.name, "claim"));
  assert.equal(claim.nextNumber, 123);
});

test("last four-digit ID is allocated once and exhaustion leaves the counter intact", async () => {
  await setCounter(MAX_ITEM_DS_NUMBER);
  assert.equal(await db.transaction(allocateItemDsId), "DS-9999");
  await assert.rejects(db.transaction(allocateItemDsId), ItemIdCapacityError);
  assert.equal(await nextCounter(), 10_000);
});

test("staff intake and pickup completion share the allocator; public offers allocate nothing", async () => {
  const historical = itemValues("DS-1000");
  await db.insert(donationItemsTable).values(historical);
  await setCounter(1);
  const pickupId = await seedPickup();
  const responses = await Promise.all([
    post("/items", {
      name: "Staff allocation check", category: "equipment",
      condition: "good", donor: "Synthetic staff donor", lotNumber: "LOT-TEST",
    }),
    post("/public/donate", { name: "Public allocation check", donorName: "Synthetic public donor" }),
    post(`/pickups/${pickupId}/complete`, { itemsReceived: "Pickup allocation check" }),
  ]);
  assert.deepEqual(responses.map((response) => response.status), [201, 201, 200]);
  const [staff, publicOffer, pickup] = await Promise.all(responses.map((response) => response.json())) as [
    { itemId: string }, { reference: string; itemId?: string }, { item: { itemId: string } },
  ];
  assert.match(publicOffer.reference, /^SUB-/);
  assert.equal(publicOffer.itemId, undefined);
  assert.deepEqual([staff.itemId, pickup.item.itemId].sort(), ["DS-1001", "DS-1002"]);
  const [unchanged] = await db.select().from(donationItemsTable)
    .where(eq(donationItemsTable.id, historical.id));
  assert.equal(unchanged.itemId, "DS-1000");
  assert.equal(await nextCounter(), 1_003);
});

test("concurrent pickup completion returns one item without consuming two IDs", async () => {
  const pickupId = await seedPickup();
  const responses = await Promise.all([
    post(`/pickups/${pickupId}/complete`, { itemsReceived: "Concurrent pickup" }),
    post(`/pickups/${pickupId}/complete`, { itemsReceived: "Concurrent pickup" }),
  ]);
  const successful = responses.filter((response) => response.status === 200);
  assert.ok(successful.length >= 1);
  for (const response of responses) assert.ok([200, 409].includes(response.status));
  const saved = await db.select().from(donationItemsTable);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].sourcePickupId, pickupId);
  assert.equal(saved[0].itemId, "DS-0006");
  assert.equal(await nextCounter(), 7);
});

test("CLI import keeps its identity and advances subsequent intake beyond it", async () => {
  const historical = itemValues("DS-4000");
  const imported = await post("/import", [historical]);
  assert.equal(imported.status, 200);
  assert.equal(await nextCounter(), 4_001);
  const rerun = await post("/import", [historical]);
  assert.equal(rerun.status, 200);
  assert.equal((await db.select().from(donationItemsTable)).length, 1);
  const intake = await post("/items", {
    name: "After import", category: "equipment", condition: "good", donor: "Synthetic donor",
    lotNumber: "LOT-TEST",
  });
  assert.equal(intake.status, 201);
  const intakeBody = await intake.json() as { itemId: string };
  assert.equal(intakeBody.itemId, "DS-4001");
});

test("physical intake rejects capacity exhaustion; public offers remain available", async () => {
  await setCounter(10_000);
  const pickupId = await seedPickup();
  const responses = await Promise.all([
    post("/items", { name: "Capacity check", category: "equipment", condition: "good", donor: "Synthetic donor", lotNumber: "LOT-TEST" }),
    post(`/pickups/${pickupId}/complete`, { itemsReceived: "Capacity check" }),
  ]);
  const offer = await post("/public/donate", { name: "Capacity check" });
  assert.equal(offer.status, 201);
  for (const response of responses) {
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: new ItemIdCapacityError().message });
  }
  assert.equal((await db.select().from(donationItemsTable)).length, 0);
  assert.equal((await db.select().from(donorsTable)).length, 0);
  assert.equal(await nextCounter(), 10_000);
  const [pickup] = await db.select().from(pickupRequestsTable).where(eq(pickupRequestsTable.id, pickupId));
  assert.equal(pickup.status, "dispatched");
});
