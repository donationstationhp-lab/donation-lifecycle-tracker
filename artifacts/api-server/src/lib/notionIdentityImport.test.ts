import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import express from "express";
import { eq, sql } from "drizzle-orm";
import { db, itemIdentitiesTable, notionItemSnapshotsTable, itemSnowTable,
  itemSnowHistoryTable, trackingCountersTable, itemTierConfirmationsTable,
  itemSnowProposalHistoryTable, itemSnowBacktestsTable } from "@workspace/db";
import { isolateTestDatabase } from "../test/databaseIsolation";
import { createApiKeyAuth, requireStaff } from "../middlewares/apiKeyAuth";
import { importNotionIdentities, runImportedSnowRules, notionBacktestReport } from "./notionIdentityImport";
import { foodFacts, proposeSnowRulesV1 } from "./snowRulesV1";
import { type NotionItemPage } from "./notionItemReader";
import importRouter from "../routes/notionImport";
import snowRouter from "../routes/itemSnow";

let cleanup: () => Promise<void>;
let close: () => Promise<void>;
let base: string;
test.before(async () => {
  cleanup = await isolateTestDatabase();
  const app = express();
  app.use(express.json());
  app.use(createApiKeyAuth({
    getRole: async (req) => req.header("x-test-role") as "staff" | "supervisor" | "community" | undefined ?? null,
    getUserId: (req) => req.header("x-test-user"),
    getExpectedApiKey: () => "test-only-key",
  }));
  app.use(requireStaff, importRouter, snowRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  base = `http://127.0.0.1:${address.port}`;
  close = () => new Promise((resolve, reject) => {
    server.closeAllConnections(); server.close((e) => e ? reject(e) : resolve());
  });
});
test.after(async () => { if (close) await close(); if (cleanup) await cleanup(); });
test.beforeEach(async () => {
  await db.execute(sql`TRUNCATE item_ds_reservations, item_snow_proposal_history, item_snow_backtests, item_tier_confirmations,
    item_snow_history, item_snow, notion_item_snapshots,
    item_external_references, item_identity_aliases, item_identities, donation_items, tracking_counters`);
});
function page(id: string | null, extra: Record<string, string> = {}): NotionItemPage {
  const fields: Record<string, string> = {
    Name: "Synthetic item", Category: "food", "Item ID": id ?? "", "T.I.E.R.": "R — Resources",
    "S.N.O.W. Category Tier": "", Stage: "storage", ...extra,
  };
  return {
    id: randomUUID(), url: "https://www.notion.so/test", last_edited_time: "2026-10-01T12:00:00Z",
    properties: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, {
      type: "rich_text", rich_text: [{ plain_text: v }],
    }])),
  };
}
const staff = { "x-test-user": "synthetic-staff", "x-test-role": "staff", "Content-Type": "application/json" };

test("v2 preserves v1 proposals, accepted history and local staff T.I.E.R. across reimport", async () => {
  const brownies = page("DS-0004", {
    Name: "Homemade brownies", "S.N.O.W. Category Tier": "URGENT", "T.I.E.R.": "",
  });
  const salad = page("DS-L-0004", { Name: "Heirloom Tomato Salad", Donor: "Boka Catering" });
  await importNotionIdentities([brownies, salad]);
  await runImportedSnowRules("rules-v1");
  const [snapshot] = await db.select().from(notionItemSnapshotsTable).where(eq(notionItemSnapshotsTable.sourceItemId, "DS-0004"));
  const [stateBefore] = await db.select().from(itemSnowTable).where(eq(itemSnowTable.itemId, snapshot.identityId));
  const historyBefore = await db.select().from(itemSnowHistoryTable);
  await db.insert(itemTierConfirmationsTable).values({
    itemId: snapshot.identityId, tier: "R", confirmedBy: "DeWayne", confirmedOn: "2026-10-16", reason: "Staff confirmation",
  });
  const run = await runImportedSnowRules("rules-v2");
  assert.equal(run.proposed, 2);
  const [stateAfter] = await db.select().from(itemSnowTable).where(eq(itemSnowTable.itemId, snapshot.identityId));
  assert.equal(stateAfter.proposalSource, "rules-v2");
  assert.equal(stateAfter.acceptedTier, stateBefore.acceptedTier);
  assert.equal(stateAfter.acceptedAt?.toISOString(), stateBefore.acceptedAt?.toISOString());
  assert.deepEqual(await db.select().from(itemSnowHistoryTable), historyBefore);
  const archived = await db.select().from(itemSnowProposalHistoryTable)
    .where(eq(itemSnowProposalHistoryTable.itemId, snapshot.identityId));
  assert.equal(archived.length, 2);
  assert.ok(archived.some((p) => p.id === stateBefore.proposalId && p.source === "rules-v1"));
  assert.ok(archived.some((p) => p.source === "rules-v2"));
  const priorId = stateAfter.proposalId;
  await runImportedSnowRules("rules-v2");
  const [rerun] = await db.select().from(itemSnowTable).where(eq(itemSnowTable.itemId, snapshot.identityId));
  assert.equal(rerun.proposalId, priorId);
  const evaluations = await db.select().from(itemSnowBacktestsTable);
  assert.ok(evaluations.some((e) => e.version === "rules-v1" && e.proposal === null));
  await importNotionIdentities([brownies, salad]);
  const report = await notionBacktestReport();
  const confirmed = report.items.find((i) => i.id === "DS-0004")!;
  assert.equal(confirmed.tier, "R");
  assert.equal(confirmed.tierFromNotion, null);
  assert.match(confirmed.tierConfirmation!, /DeWayne, 2026-10-16/);
  assert.equal(confirmed.needsReview, false);
  const catering = report.items.find((i) => i.id === "DS-L-0004")!;
  assert.equal(catering.proposalV1, null);
  assert.equal(catering.proposal, "URGENT");
  assert.equal(catering.comparison, "no_accepted");
  const apiKeyRun = await fetch(`${base}/snow/rules-v2/run`, {
    method: "POST", headers: { "x-api-key": "test-only-key" },
  });
  assert.equal(apiKeyRun.status, 403);
});

test("rules distinguish unknown dates, actual undated food, sealed dates and non-food", () => {
  assert.equal(proposeSnowRulesV1(foodFacts({ name: "Unknown groceries", category: "food" })), null);
  assert.equal(proposeSnowRulesV1(foodFacts({ name: "Food, no date", category: "food" }))?.tier, "URGENT");
  assert.equal(proposeSnowRulesV1(foodFacts({ name: "Unlabeled food", category: "food" }))?.tier, "URGENT");
  assert.equal(proposeSnowRulesV1(foodFacts({ name: "Sealed crackers", category: "food", expiryDate: "2027-01-01" }))?.tier, "STABLE");
  assert.equal(proposeSnowRulesV1(foodFacts({ name: "Unsealed crackers", category: "food", expiryDate: "2027-01-01" })), null);
  assert.equal(proposeSnowRulesV1(foodFacts({ name: "Homemade scarf", category: "clothing" })), null);
  assert.equal(proposeSnowRulesV1(foodFacts({ name: "Not homemade sealed food", category: "food", expiryDate: "2027-01-01" }))?.tier, "STABLE");
  assert.match(proposeSnowRulesV1(foodFacts({
    name: "Homemade brownies", category: "food", receivedDate: "2026-09-12",
  }))!.rationale, /2026-09-15/);
});

test("cross-item comparisons and policy examples cannot misclassify sealed food as homemade", () => {
  const result = proposeSnowRulesV1(foodFacts({
    name: "Protein cookie", category: "food", expiryDate: "2027-06-01",
    notes: "Sealed, commercially packaged and labeled. DECISION 2 does not apply — that rule governs unlabeled homemade food. CONTRAST WITH DS-0004: Homemade + no label = URGENT.",
  }));
  assert.equal(result?.tier, "STABLE");
});

test("both ID lineages and missing/non-DS IDs are preserved without invented IDs", async () => {
  const pages = [page("DS-0042"), page("DS-L-9999"), page("EXT-exact Case"), page(null)];
  const result = await importNotionIdentities(pages);
  assert.equal(result.created, 4); assert.equal(result.nextDsNumber, "43");
  const report = await notionBacktestReport();
  assert.equal(report.items.find((r) => r.id === "DS-L-9999")?.displayId, "DS-L-9999");
  assert.equal(report.items.find((r) => r.id === "EXT-exact Case")?.needsReview, true);
  assert.equal(report.items.find((r) => r.id === null)?.displayId, null);
  for (const p of pages) {
    const response = await fetch(`${base}/item-identities/lookup?key=${p.id}`, { headers: staff });
    assert.equal(response.status, 200);
    const body = await response.json() as { identities: Array<{ id: string }> };
    const expected = report.items.find((r) => r.notionPageId === p.id)!;
    assert.equal(body.identities[0].id, expected.identityId);
  }
  const byDs = await fetch(`${base}/item-identities/lookup?key=DS-0042`, { headers: staff });
  assert.equal(byDs.status, 200);
});

test("first import hydrates accepted Notion tiers with provenance and no T.I.E.R. invention", async () => {
  const p = page("DS-0001", { "S.N.O.W. Category Tier": "SURPLUS", "T.I.E.R.": "" });
  const result = await importNotionIdentities([p]);
  assert.equal(result.acceptedImported, 1);
  const [snow] = await db.select().from(itemSnowTable);
  assert.equal(snow.acceptedTier, "SURPLUS"); assert.equal(snow.acceptedSource, "Notion import");
  assert.equal(snow.acceptedDecision, "notion_import"); assert.equal(snow.proposedTier, null);
  const [history] = await db.select().from(itemSnowHistoryTable);
  assert.equal(history.source, "Notion import"); assert.equal(history.acceptedTier, "SURPLUS");
  const [snapshot] = await db.select().from(notionItemSnapshotsTable);
  assert.equal(snapshot.tier, null);
});

test("rerun matches page identities; changed Notion acceptance never overwrites local staff decision", async () => {
  const p = page("DS-0001", { "S.N.O.W. Category Tier": "URGENT" });
  await importNotionIdentities([p]);
  const [snow] = await db.select().from(itemSnowTable);
  const response = await fetch(`${base}/items/${snow.itemId}/snow`, {
    method: "POST", headers: staff, body: JSON.stringify({
      action: "override", tier: "STABLE", reason: "TEST staff decision", expectedVersion: snow.version,
    }),
  });
  assert.equal(response.status, 200);
  p.properties["S.N.O.W. Category Tier"].rich_text![0].plain_text = "SURPLUS";
  const result = await importNotionIdentities([p]);
  assert.equal(result.created, 0); assert.equal(result.matched, 1); assert.equal(result.acceptedImported, 0);
  const [after] = await db.select().from(itemSnowTable);
  assert.equal(after.acceptedTier, "STABLE"); assert.equal(after.acceptedSource, "Staff review");
  assert.equal((await db.select().from(itemSnowHistoryTable)).length, 2);
});

test("duplicate IDs are isolated and exact lookup reports ambiguity rather than merging", async () => {
  await importNotionIdentities([page("DS-0009"), page("DS-0009")]);
  const report = await notionBacktestReport();
  assert.equal(report.items.length, 2);
  assert.ok(report.items.every((r) => r.displayId === null && r.needsReview));
  const lookup = await fetch(`${base}/item-identities/lookup?key=DS-0009`, { headers: staff });
  assert.equal(lookup.status, 409);
  assert.equal((await lookup.json() as { identities: unknown[] }).identities.length, 2);
});

test("concurrent reruns create exactly one identity and one accepted history entry", async () => {
  const p = page("DS-0001", { "S.N.O.W. Category Tier": "STABLE" });
  const results = await Promise.all([importNotionIdentities([p]), importNotionIdentities([p])]);
  assert.equal(results.reduce((sum, r) => sum + r.created, 0), 1);
  assert.equal(results.reduce((sum, r) => sum + r.acceptedImported, 0), 1);
  assert.equal((await db.select().from(itemIdentitiesTable)).length, 1);
  assert.equal((await db.select().from(itemSnowHistoryTable)).length, 1);
});

test("changed source IDs remain aliases and do not rename original identities", async () => {
  const p = page("DS-L-0006");
  await importNotionIdentities([p]);
  p.properties["Item ID"].rich_text![0].plain_text = "DS-L-0020";
  await importNotionIdentities([p]);
  const [identity] = await db.select().from(itemIdentitiesTable);
  assert.equal(identity.displayId, "DS-L-0006");
  for (const key of ["DS-L-0006", "DS-L-0020", p.id]) {
    const response = await fetch(`${base}/item-identities/lookup?key=${key}`, { headers: staff });
    assert.equal((await response.json() as { identities: Array<{ id: string }> }).identities[0].id, identity.id);
  }
});

test("batch proposals preserve every acceptance and history; identical runs do not churn versions", async () => {
  await importNotionIdentities([
    page("DS-0004", { Name: "Homemade brownies", "S.N.O.W. Category Tier": "URGENT", "Date Received": "2026-09-12" }),
    page("DS-0005", { Name: "Sealed cookie", "Expiry Date": "2027-06-01", "S.N.O.W. Category Tier": "SURPLUS" }),
    page("DS-L-0017", { Name: "Groceries" }),
  ]);
  const before = await db.select().from(itemSnowHistoryTable);
  assert.equal((await runImportedSnowRules()).proposed, 2);
  const first = await db.select().from(itemSnowTable);
  assert.equal(first.find((s) => s.acceptedTier === "SURPLUS")?.proposedTier, "STABLE");
  await runImportedSnowRules();
  assert.deepEqual(await db.select().from(itemSnowTable), first);
  assert.deepEqual(await db.select().from(itemSnowHistoryTable), before);
  const report = await notionBacktestReport();
  assert.deepEqual(report.summary, { total: 3, agree: 1, different: 1, noProposal: 1, noAccepted: 0, needsReview: 0 });
});

test("invalid batch rolls back identities, accepted history and counter together", async () => {
  const invalid = page("DS-0044"); invalid.url = undefined as unknown as string;
  await assert.rejects(importNotionIdentities([page("DS-0043"), invalid]));
  assert.equal((await db.select().from(itemIdentitiesTable)).length, 0);
  assert.equal((await db.select().from(trackingCountersTable)).length, 0);
});

test("older imports cannot replace newer snapshots or identity names", async () => {
  const newer = page("DS-0042", { Name: "Newer", Notes: "Sealed" });
  newer.last_edited_time = "2026-10-02T12:00:00Z";
  await importNotionIdentities([newer]);
  const old = structuredClone(newer);
  old.last_edited_time = "2026-10-01T12:00:00Z"; old.properties.Name.rich_text![0].plain_text = "Older";
  await importNotionIdentities([old]);
  assert.equal((await db.select().from(itemIdentitiesTable))[0].name, "Newer");
  assert.equal((await db.select().from(notionItemSnapshotsTable))[0].name, "Newer");
});

test("reports, lookups and proposal runs require staff; imports require named supervisors", async () => {
  assert.equal((await fetch(`${base}/notion-import/report`)).status, 401);
  assert.equal((await fetch(`${base}/notion-import/report`, {
    headers: { "x-test-user": "community-user", "x-test-role": "community" },
  })).status, 403);
  assert.equal((await fetch(`${base}/notion-import`, { method: "POST", headers: staff })).status, 403);
  assert.equal((await fetch(`${base}/notion-import`, {
    method: "POST", headers: { "x-api-key": "test-only-key" },
  })).status, 403);
  assert.equal((await fetch(`${base}/snow/rules-v1/run`, {
    method: "POST", headers: { "x-api-key": "test-only-key" },
  })).status, 403);
});
