import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import express, { type ErrorRequestHandler } from "express";
import { eq, sql } from "drizzle-orm";
import { db, donationItemsTable, itemSnowTable, itemSnowHistoryTable } from "@workspace/db";
import { createApiKeyAuth } from "../middlewares/apiKeyAuth";
import { recordSnowProposal } from "../lib/itemSnow";
import { itemRepository } from "../lib/itemRepository";
import { isolateTestDatabase } from "../test/databaseIsolation";
import router from "./itemSnow";

const app = express();
app.use(express.json());
app.use(createApiKeyAuth({
  getExpectedApiKey: () => "synthetic-api-key",
  getUserId: (req) => req.header("x-test-actor") ?? null,
  getRole: async (req) => {
    const role = req.header("x-test-role");
    return role === "staff" || role === "supervisor" || role === "community" ? role : null;
  },
}));
app.use("/api", router);
const errors: ErrorRequestHandler = (_error, _req, res, _next) => {
  res.status(500).json({ error: "Test transaction failed" });
};
app.use(errors);
let cleanup: () => Promise<void>;
let close: () => Promise<void>;
let baseUrl: string;
let itemId: string;

test.before(async () => {
  cleanup = await isolateTestDatabase();
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
  close = () => new Promise<void>((resolve, reject) => {
    server.closeAllConnections();
    server.close((error) => error ? reject(error) : resolve());
  });
});
test.beforeEach(async () => {
  await db.execute(sql`TRUNCATE item_snow_history, item_snow, donation_items, item_identities`);
  itemId = randomUUID();
  await db.execute(sql`INSERT INTO item_identities (id, display_id, lineage, name) VALUES (${itemId}, 'DS-TEST-SNOW', 'unidentified', 'Synthetic S.N.O.W. test')`);
  await db.insert(donationItemsTable).values({
    id: itemId, itemId: "DS-TEST-SNOW", name: "Synthetic S.N.O.W. test",
    tier: "R", category: "Test", condition: "good", donor: "Synthetic donor",
    lotNumber: "LOT-TEST", pendingReview: false,
  });
});
test.after(async () => {
  if (close) await close();
  if (cleanup) await cleanup();
});

function request(body?: unknown, actor = "staff-a", role = "staff", extra: Record<string, string> = {}) {
  return fetch(`${baseUrl}/api/items/${itemId}/snow`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(actor ? { "x-test-actor": actor } : {}),
      "x-test-role": role, ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function state() {
  const response = await request();
  assert.equal(response.status, 200);
  return await response.json() as {
    version: number; proposal: { tier: string; source: string; rationale: string | null } | null;
    accepted: { tier: string; by: string; at: string; decision: string } | null;
    awaitingReview: boolean;
    history: Array<{ acceptedBy: string; acceptedTier: string; previousTier: string | null;
      decision: string; proposal: { tier: string; source: string } | null }>;
  };
}
async function propose(tier: "URGENT" | "STABLE" | "SURPLUS" = "URGENT", source = "rule") {
  await db.transaction((tx) => recordSnowProposal(tx, itemId, { tier, source, rationale: "Synthetic rationale" }));
}

test("existing items have empty independent slots without creating proposals or acceptance", async () => {
  assert.deepEqual(await state(), { version: 0, proposal: null, accepted: null, awaitingReview: false, history: [], proposalHistory: [] });
  assert.equal((await db.select().from(itemSnowTable)).length, 0);
});

test("only signed-in staff or supervisors may decide; unattended API keys cannot accept", async () => {
  const body = { action: "override", expectedVersion: 0, tier: "STABLE", reason: "Manual classification" };
  assert.equal((await request(body, "")).status, 401);
  assert.equal((await request(body, "community-a", "community")).status, 403);
  assert.equal((await request(undefined, "community-a", "community")).status, 403);
  assert.equal((await request(body, "", "", { "x-api-key": "synthetic-api-key" })).status, 403);
  assert.equal((await state()).accepted, null);
  assert.equal((await request(body, "supervisor-a", "supervisor")).status, 200);
  assert.equal((await state()).accepted?.by, "supervisor-a");
});

test("manual staff decisions preserve T.I.E.R. and append accepted change history", async () => {
  assert.equal((await request({
    action: "override", expectedVersion: 0, tier: "STABLE", reason: "Staff assessment",
  })).status, 200);
  assert.equal((await request({
    action: "override", expectedVersion: 1, tier: "SURPLUS", reason: "Capacity changed",
  }, "staff-b")).status, 200);
  const review = await state();
  assert.equal(review.accepted?.tier, "SURPLUS");
  assert.equal(review.accepted?.decision, "manual");
  assert.equal(review.accepted?.by, "staff-b");
  assert.deepEqual(review.history.map((entry) => [entry.previousTier, entry.acceptedTier, entry.acceptedBy]),
    [["STABLE", "SURPLUS", "staff-b"], [null, "STABLE", "staff-a"]]);
  const [item] = await db.select().from(donationItemsTable).where(eq(donationItemsTable.id, itemId));
  assert.equal(item.tier, "R");
  assert.equal(item.pendingReview, false);
});

test("proposal confirmation records its snapshot; replacement proposals never overwrite acceptance", async () => {
  await propose("STABLE", "rule");
  const proposed = await state();
  assert.equal(proposed.awaitingReview, true);
  assert.equal(proposed.accepted, null);
  assert.equal((await request({ action: "confirm", expectedVersion: 1 })).status, 200);
  const confirmed = await state();
  assert.equal(confirmed.accepted?.decision, "confirmed");
  await propose("URGENT", "future-proposer");
  const replaced = await state();
  assert.deepEqual(replaced.accepted, confirmed.accepted);
  assert.deepEqual(replaced.history, confirmed.history);
  assert.equal(replaced.proposal?.tier, "URGENT");
  assert.equal(replaced.awaitingReview, false);
  assert.equal(replaced.history[0].proposal?.tier, "STABLE");
  assert.equal(replaced.history[0].proposal?.source, "rule");
});

test("override records a different accepted tier and staff reason without changing proposal", async () => {
  await propose("URGENT");
  const proposal = (await state()).proposal;
  assert.equal((await request({
    action: "override", expectedVersion: 1, tier: "SURPLUS", reason: "Staff checked supply",
  })).status, 200);
  const review = await state();
  assert.equal(review.accepted?.tier, "SURPLUS");
  assert.equal(review.accepted?.decision, "overridden");
  assert.deepEqual(review.proposal, proposal);
});

test("review rejects missing proposals, invalid tiers, missing reasons and spoofed actors", async () => {
  assert.equal((await request({ action: "confirm", expectedVersion: 0 })).status, 409);
  for (const body of [
    { action: "override", expectedVersion: 0, tier: "IDLE", reason: "Invalid" },
    { action: "override", expectedVersion: 0, tier: "T", reason: "Not S.N.O.W." },
    { action: "override", expectedVersion: 0, tier: "URGENT" },
    { action: "override", expectedVersion: 0, tier: "URGENT", reason: " " },
    { action: "override", expectedVersion: 0, tier: "URGENT", reason: "Valid", acceptedBy: "spoofed" },
    { action: "override", expectedVersion: 1.5, tier: "URGENT", reason: "Invalid" },
  ]) assert.equal((await request(body)).status, 400);
  assert.equal((await state()).accepted, null);
});

test("stale and simultaneous decisions cannot silently replace another staff decision", async () => {
  await propose();
  const responses = await Promise.all([
    request({ action: "confirm", expectedVersion: 1 }, "staff-a"),
    request({ action: "override", expectedVersion: 1, tier: "STABLE", reason: "Different assessment" }, "staff-b"),
  ]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
  assert.equal((await state()).history.length, 1);
  assert.equal((await request({ action: "confirm", expectedVersion: 1 })).status, 409);
});

test("a changed proposal invalidates an old review and proposal writer cannot accept tiers", async () => {
  await propose();
  await propose("SURPLUS");
  assert.equal((await request({ action: "confirm", expectedVersion: 1 })).status, 409);
  await assert.rejects(db.transaction((tx) => recordSnowProposal(tx, itemId, {
    tier: "STABLE", source: "rule", acceptedTier: "STABLE",
  } as never)));
  assert.equal((await state()).accepted, null);
});

test("awaiting S.N.O.W. filter is separate from general intake review", async () => {
  await propose();
  assert.equal((await itemRepository.list({ awaitingSnowReview: true })).length, 1);
  assert.equal((await itemRepository.list({ awaitingSnowReview: true, pendingReview: true })).length, 0);
  assert.equal((await request({ action: "confirm", expectedVersion: 1 })).status, 200);
  assert.equal((await itemRepository.list({ awaitingSnowReview: true })).length, 0);
});

test("failure to append the audit rolls back accepted value and version", async () => {
  await db.execute(sql`ALTER TABLE item_snow_history ADD CONSTRAINT snow_test_failure CHECK (accepted_tier <> 'URGENT')`);
  try {
    assert.equal((await request({
      action: "override", expectedVersion: 0, tier: "URGENT", reason: "Rollback test",
    })).status, 500);
    assert.equal((await state()).accepted, null);
    assert.equal((await state()).version, 0);
    assert.equal((await db.select().from(itemSnowHistoryTable)).length, 0);
  } finally {
    await db.execute(sql`ALTER TABLE item_snow_history DROP CONSTRAINT snow_test_failure`);
  }
});
