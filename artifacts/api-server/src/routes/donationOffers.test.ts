import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import {
  db, donationItemsTable, donationSubmissionsTable, itemIdentitiesTable,
  stageHistoryTable, serviceActivitiesTable, trackingCountersTable,
  type DonationOfferDetails,
} from "@workspace/db";
import { isolateTestDatabase } from "../test/databaseIsolation";
import { createApiKeyAuth } from "../middlewares/apiKeyAuth";
import { itemRepository } from "../lib/itemRepository";
import { SubmitDonationOfferResponse, ReviewDonationOfferResponse, ReceiveDonationOfferResponse } from "@workspace/api-zod";
import { MAX_ITEM_DS_NUMBER } from "../lib/itemIds";
import publicRouter from "./publicRoutes";
import offersRouter from "./donationOffers";

const app = express();
app.use(express.json());
app.use(publicRouter);
app.use(createApiKeyAuth({
  getExpectedApiKey: () => "synthetic-offer-api-key",
  getUserId: (req) => req.headers["x-fixture-role"] ? "fixture-clerk-user" : null,
  getRole: async (req) => {
    const role = req.headers["x-fixture-role"];
    return role === "staff" || role === "supervisor" || role === "community" ? role : null;
  },
}));
app.use(offersRouter);
app.use(((error, _req, res, _next) => {
  res.status(500).json({ error: "Synthetic test operation failed" });
}) as express.ErrorRequestHandler);

let cleanup: () => Promise<void>;
let close: () => Promise<void>;
let base: string;
test.before(async () => {
  cleanup = await isolateTestDatabase(); // Definitions only; no application data copied.
  const current = await db.execute<{ schema: string }>(sql`SELECT current_schema() AS schema`);
  assert.match(current.rows[0].schema, /^test_item_ids_/);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  base = `http://127.0.0.1:${address.port}`;
  close = () => new Promise<void>((resolve, reject) => {
    server.closeAllConnections();
    server.close((error) => error ? reject(error) : resolve());
  });
});
test.beforeEach(async () => {
  await db.execute(sql`TRUNCATE donation_submissions, donation_items, item_identities,
    stage_history, service_activities, tracking_counters`);
  await db.insert(trackingCountersTable).values({ name: "item_ds", nextNumber: 6396 });
});
test.after(async () => {
  if (close) await close();
  if (cleanup) await cleanup();
});

const original = {
  name: "Synthetic original offer", donorName: "Synthetic donor",
  condition: "good" as const, quantity: 2, notes: "Needs pickup",
};
async function readJson<T>(response: Response, schema: { parse(input: unknown): T }): Promise<T> {
  return schema.parse(await response.json());
}
function request(path: string, body?: unknown, role?: string, headers: Record<string, string> = {}) {
  return fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json", ...(role ? { "x-fixture-role": role } : {}), ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function submit() {
  const response = await request("/public/donate", original);
  assert.equal(response.status, 201);
  const result = await readJson(response, SubmitDonationOfferResponse);
  const [offer] = await db.select().from(donationSubmissionsTable)
    .where(eq(donationSubmissionsTable.reference, result.reference));
  return offer;
}
async function review(id: string, decision = "approved") {
  return request(`/donation-offers/${id}/review`, { decision, by: "forged-actor" }, "staff");
}
function receive(id: string, details: DonationOfferDetails = original) {
  return request(`/donation-offers/${id}/receive`, { detailsVerified: true, receivedDetails: details }, "staff");
}
async function counter() {
  const [row] = await db.select().from(trackingCountersTable).where(eq(trackingCountersTable.name, "item_ds"));
  return row?.nextNumber;
}
async function assertNoPhysicalRecords() {
  for (const table of [donationItemsTable, itemIdentitiesTable, stageHistoryTable, serviceActivitiesTable]) {
    assert.equal((await db.select().from(table)).length, 0);
  }
  assert.equal(await counter(), 6396);
}

test("public response is reference-only and originals ignore forged staff fields", async () => {
  const response = await request("/public/donate", {
    ...original, status: "received", receivedBy: "forged-user", receivedItemId: randomUUID(),
  });
  const body = await readJson(response, SubmitDonationOfferResponse);
  assert.equal(response.status, 201);
  assert.deepEqual(Object.keys(body).sort(), ["message", "reference"]);
  assert.match(body.reference, /^SUB-[0-9a-f]{8}-[0-9a-f-]{27}$/);
  assert.equal(body.message, "Offer submitted—not yet received");
  const [saved] = await db.select().from(donationSubmissionsTable);
  assert.deepEqual(saved.offeredDetails, original);
  assert.equal(saved.status, "submitted");
  assert.equal(saved.reviewedBy, null);
  assert.equal(saved.receivedBy, null);
  await assertNoPhysicalRecords();
});

test("submission and review work without creating a counter, even when numbering is exhausted", async () => {
  await db.delete(trackingCountersTable);
  const offer = await submit();
  assert.equal((await review(offer.id)).status, 200);
  assert.equal(await counter(), undefined);
  await db.insert(trackingCountersTable).values({ name: "item_ds", nextNumber: MAX_ITEM_DS_NUMBER + 1 });
  const another = await submit();
  assert.equal((await review(another.id, "declined")).status, 200);
  const response = await receive(offer.id);
  assert.equal(response.status, 503);
  assert.equal((await db.select().from(donationItemsTable)).length, 0);
  assert.equal((await db.select().from(itemIdentitiesTable)).length, 0);
  assert.equal(await counter(), MAX_ITEM_DS_NUMBER + 1);
});

test("approve and decline only submitted offers; repeated review preserves original actor/time", async () => {
  const approved = await submit();
  const first = await readJson(await review(approved.id), ReviewDonationOfferResponse);
  const again = await readJson(await review(approved.id), ReviewDonationOfferResponse);
  assert.equal(first.reviewedBy, "fixture-clerk-user");
  assert.deepEqual(first.reviewedAt, again.reviewedAt);
  assert.equal((await review(approved.id, "declined")).status, 409);
  const declined = await submit();
  assert.equal((await review(declined.id, "declined")).status, 200);
  assert.equal((await review(declined.id)).status, 409);
  await assertNoPhysicalRecords();
});

test("only approved offers and explicit verification can create physical receipt", async () => {
  const offer = await submit();
  assert.equal((await receive(offer.id)).status, 409);
  const declined = await submit();
  await review(declined.id, "declined");
  assert.equal((await receive(declined.id)).status, 409);
  await review(offer.id);
  for (const body of [
    { receivedDetails: original }, { detailsVerified: false, receivedDetails: original },
    { detailsVerified: true, receivedDetails: { ...original, name: " " } },
    { detailsVerified: true, receivedDetails: { ...original, expiryDate: "2026-02-30" } },
  ]) {
    assert.equal((await request(`/donation-offers/${offer.id}/receive`, body, "staff")).status, 400);
  }
  await assertNoPhysicalRecords();
});

test("receipt retains originals, creates one item/identity/history/receipt event and named provenance", async () => {
  const offer = await submit();
  await review(offer.id);
  const corrected = { ...original, name: "Verified received goods", quantity: 3, notes: "Count corrected at receipt" };
  const response = await receive(offer.id, corrected);
  assert.equal(response.status, 200);
  const item = await readJson(response, ReceiveDonationOfferResponse);
  assert.equal(item.itemId, "DS-6396");
  assert.equal(item.name, "Verified received goods (×3)");
  const [saved] = await db.select().from(donationSubmissionsTable);
  assert.deepEqual(saved.offeredDetails, original);
  assert.deepEqual(saved.receivedDetails, corrected);
  assert.equal(saved.receivedItemId, item.id);
  assert.equal(saved.receivedBy, "fixture-clerk-user");
  assert.equal(saved.reviewedBy, "fixture-clerk-user");
  assert.ok(saved.receivedAt);
  assert.equal((await db.select().from(itemIdentitiesTable))[0].displayId, item.itemId);
  assert.equal((await db.select().from(stageHistoryTable)).length, 1);
  const events = await db.select().from(serviceActivitiesTable);
  assert.equal(events.filter((e) => e.activityType === "donation_intake").length, 1);
  assert.equal(events.filter((e) => e.activityType === "acknowledgment").length, 1);
  assert.equal(await counter(), 6397);
  assert.equal((await review(offer.id)).status, 409);
});

test("repeated and concurrent receipt returns the same item without reserving more numbers", async () => {
  const offer = await submit();
  await review(offer.id);
  const responses = await Promise.all(Array.from({ length: 6 }, () => receive(offer.id)));
  assert.ok(responses.every((r) => r.status === 200));
  const items = await Promise.all(responses.map((r) => readJson(r, ReceiveDonationOfferResponse)));
  assert.equal(new Set(items.map((i) => i.id)).size, 1);
  const retry = await readJson(await receive(offer.id, { ...original, name: "Do not overwrite" }), ReceiveDonationOfferResponse);
  assert.equal(retry.id, items[0].id);
  assert.equal(retry.name, "Synthetic original offer (×2)");
  assert.equal((await db.select().from(donationItemsTable)).length, 1);
  assert.equal((await db.select().from(stageHistoryTable)).length, 1);
  assert.equal(await counter(), 6397);
});

test("excellent condition from the existing public form survives receipt and its response contract", async () => {
  const offer = await submit();
  await review(offer.id);
  const response = await receive(offer.id, { ...original, condition: "excellent" });
  assert.equal(response.status, 200);
  const item = await readJson(response, ReceiveDonationOfferResponse);
  assert.equal(item.condition, "excellent");
});

test("late transaction failure rolls back inventory, identity, history, activity, receipt and allocation", async () => {
  const offer = await submit();
  await review(offer.id);
  // Trigger exists only in this isolated test schema, never public.
  await db.execute(sql`CREATE FUNCTION synthetic_receipt_failure() RETURNS trigger
    LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic receipt failure'; END $$`);
  await db.execute(sql`CREATE TRIGGER synthetic_receipt_failure_trigger BEFORE INSERT
    ON service_activities FOR EACH ROW EXECUTE FUNCTION synthetic_receipt_failure()`);
  try {
    assert.equal((await receive(offer.id)).status, 500);
    await assertNoPhysicalRecords();
    const [saved] = await db.select().from(donationSubmissionsTable);
    assert.equal(saved.status, "approved");
    assert.equal(saved.receivedDetails, null);
    assert.equal(saved.receivedItemId, null);
  } finally {
    await db.execute(sql`DROP TRIGGER synthetic_receipt_failure_trigger ON service_activities`);
    await db.execute(sql`DROP FUNCTION synthetic_receipt_failure()`);
  }
  const retry = await readJson(await receive(offer.id), ReceiveDonationOfferResponse);
  assert.equal(retry.itemId, "DS-6396");
});

test("uniqueness constraint forbids two submission rows pointing to the same item", async () => {
  const first = await submit();
  await review(first.id);
  const item = await readJson(await receive(first.id), ReceiveDonationOfferResponse);
  const second = await submit();
  await review(second.id);
  await assert.rejects(db.update(donationSubmissionsTable).set({
    status: "received", receivedItemId: item.id, receivedDetails: original,
    receivedBy: "fixture-clerk-user", receivedAt: new Date(),
  }).where(eq(donationSubmissionsTable.id, second.id)));
  assert.equal((await db.select().from(donationItemsTable)).length, 1);
  assert.equal(await counter(), 6397);
});

test("new offer workflow never renumbers old DS or DS-L inventory or changes historical review flags", async () => {
  const old = await itemRepository.insert({
    id: randomUUID(), itemId: "DS-L-0016", name: "Synthetic historical item",
    category: "equipment", tier: "R", condition: "good", donor: "Synthetic legacy",
    pendingReview: true, lotNumber: "LOT-TEST-LEGACY",
  });
  const before = await db.select().from(donationItemsTable);
  const offer = await submit();
  await review(offer.id);
  await receive(offer.id);
  const [unchanged] = await db.select().from(donationItemsTable).where(eq(donationItemsTable.id, old.id));
  assert.deepEqual(unchanged, before[0]);
  assert.equal(await counter(), 6397);
});

test("protected endpoints reject signed-out, community and unassigned users; mutation rejects API-key impersonation", async () => {
  const offer = await submit();
  for (const role of [undefined, "community", "unassigned"]) {
    const expected = role ? 403 : 401;
    assert.equal((await request("/donation-offers", undefined, role)).status, expected);
    assert.equal((await request(`/donation-offers/${offer.id}/review`, { decision: "approved" }, role)).status, expected);
    assert.equal((await request(`/donation-offers/${offer.id}/receive`, { detailsVerified: true, receivedDetails: original }, role)).status, expected);
  }
  assert.equal((await request(`/donation-offers/${offer.id}/review`, { decision: "approved" }, undefined, {
    "x-api-key": "synthetic-offer-api-key",
  })).status, 403);
  assert.equal((await request("/donation-offers", undefined, "supervisor")).status, 200);
  assert.equal((await request(`/donation-offers/${offer.id}/review`, { decision: "approved" }, "supervisor")).status, 200);
  await assertNoPhysicalRecords();
});

test("invalid offers do not write records or emit sensitive input in errors", async () => {
  for (const input of [
    { name: " " }, { name: "Fixture", quantity: 0 }, { name: "Fixture", quantity: 1.5 },
    { name: "Fixture", expiryDate: "2026-02-30" }, { name: "Fixture", weight: -1 },
  ]) {
    const response = await request("/public/donate", { ...input, donorName: "fixture-private-marker" });
    assert.equal(response.status, 400);
    assert.doesNotMatch(await response.text(), /fixture-private-marker/);
  }
  assert.equal((await db.select().from(donationSubmissionsTable)).length, 0);
  await assertNoPhysicalRecords();
});
