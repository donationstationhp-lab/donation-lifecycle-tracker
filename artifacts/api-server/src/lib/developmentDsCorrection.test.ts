import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import {
  db, donationItemsTable, itemIdentitiesTable, itemIdentityAliasesTable,
  itemDsReservationsTable, stageHistoryTable, trackingCountersTable,
} from "@workspace/db";
import { AUGUST_LEGACY_DS_IDS, correctDevelopmentDsNumbers } from "./developmentDsCorrection";
import { allocateItemDsId, reconcileItemDsCounter } from "./itemIds";
import { isolateTestDatabase } from "../test/databaseIsolation";

let cleanup: () => Promise<void>;
test.before(async () => { cleanup = await isolateTestDatabase(); });
test.after(async () => { await cleanup(); });
test.beforeEach(async () => {
  await db.execute(sql`TRUNCATE item_ds_reservations, item_identity_aliases,
    item_external_references, notion_item_snapshots, item_identities, donation_items,
    stage_history, tracking_counters`);
});
async function fixture() {
  for (let n = 1; n <= 5; n++) await db.insert(itemIdentitiesTable).values({
    id: `pilot-${n}`, displayId: `DS-${String(n).padStart(4, "0")}`, lineage: "DS", name: "Synthetic pilot",
  });
  for (const itemId of AUGUST_LEGACY_DS_IDS) {
    const id = randomUUID();
    await db.insert(donationItemsTable).values({
      id, itemId, name: "Synthetic August", category: "test", tier: "R", condition: "good",
      donor: "Synthetic donor", lotNumber: "LOT-TEST", createdAt: new Date("2026-08-12T12:00:00Z"),
    });
    await db.insert(itemIdentitiesTable).values({ id, displayId: itemId, lineage: "DS", name: "Synthetic August" });
  }
  await db.insert(trackingCountersTable).values({ name: "item_ds", nextNumber: 6396 });
}
test("relabels all 14 atomically; keeps UUIDs, aliases and audit; backfills pilot bigint; next is six", async () => {
  await fixture();
  const before = await db.select().from(donationItemsTable);
  const result = await db.transaction(correctDevelopmentDsNumbers);
  assert.equal(result.relabeled, 14); assert.equal(result.highestCanonical, "5"); assert.equal(result.nextDsNumber, "6");
  const after = await db.select().from(donationItemsTable);
  assert.equal(after.length, before.length);
  for (const old of before) {
    const item = after.find(i => i.id === old.id)!;
    assert.equal(item.itemId, old.itemId.replace("DS-", "DS-L-")); assert.equal(item.dsNumber, null);
    assert.equal(item.stage, old.stage); assert.deepEqual(item.createdAt, old.createdAt);
    const [identity] = await db.select().from(itemIdentitiesTable).where(eq(itemIdentitiesTable.id, old.id));
    assert.equal(identity.displayId, item.itemId); assert.equal(identity.lineage, "DS-L"); assert.equal(identity.dsNumber, null);
    const [alias] = await db.select().from(itemIdentityAliasesTable).where(eq(itemIdentityAliasesTable.alias, old.itemId));
    assert.equal(alias.identityId, old.id);
  }
  const history = await db.select().from(stageHistoryTable);
  assert.equal(history.length, 14);
  assert.ok(history.every(h => h.notes?.includes("Oct 16, 2026") && h.notes.includes("predates the sequential pilot")));
  const pilot = await db.select().from(itemIdentitiesTable).where(eq(itemIdentitiesTable.id, "pilot-5"));
  assert.equal(pilot[0].dsNumber, "5");
  assert.equal(await db.transaction(allocateItemDsId), "DS-0006");
  const rerun = await db.transaction(correctDevelopmentDsNumbers);
  assert.equal(rerun.relabeled, 0); assert.equal(rerun.nextDsNumber, "7");
  assert.equal((await db.select().from(stageHistoryTable)).length, 14);
});
test("a late legacy collision rolls back the whole batch and counter", async () => {
  await fixture();
  await db.insert(itemIdentitiesTable).values({ id: "conflict", displayId: "DS-L-6395", lineage: "DS-L", name: "Synthetic conflict" });
  await assert.rejects(db.transaction(correctDevelopmentDsNumbers), /collision/);
  assert.equal((await db.select().from(donationItemsTable)).filter(i => i.itemId.startsWith("DS-L-")).length, 0);
  assert.equal((await db.select().from(stageHistoryTable)).length, 0);
  const [counter] = await db.select().from(trackingCountersTable); assert.equal(counter.nextNumber, 6396);
});
test("legacy aliases skip a reserved run without pushing the canonical floor upwards", async () => {
  await fixture(); await db.transaction(correctDevelopmentDsNumbers);
  assert.equal((await db.transaction(reconcileItemDsCounter)).toString(), "6");
  for (const [start, expected] of [[1001, "DS-1011"], [2558, "DS-2559"], [2590, "DS-2591"], [5038, "DS-5039"], [6395, "DS-6396"]] as const) {
    await db.update(trackingCountersTable).set({ nextNumber: start }).where(eq(trackingCountersTable.name, "item_ds"));
    assert.equal(await db.transaction(allocateItemDsId), expected);
  }
});
test("database reservations reject numeric duplicates and survive deletion", async () => {
  await db.insert(itemIdentitiesTable).values({ id: "one", displayId: "DS-0006", lineage: "DS", name: "Synthetic" });
  await assert.rejects(db.insert(itemIdentitiesTable).values({ id: "two", displayId: "DS-00006", lineage: "DS", name: "Synthetic" }));
  await assert.rejects(db.insert(donationItemsTable).values({
    id: "another", itemId: "DS-0006", name: "Synthetic", donor: "Synthetic", category: "test", tier: "R", condition: "good", lotNumber: "test",
  }));
  await db.delete(itemIdentitiesTable).where(eq(itemIdentitiesTable.id, "one"));
  assert.equal((await db.select().from(itemDsReservationsTable)).length, 1);
  assert.equal(await db.transaction(allocateItemDsId), "DS-0007");
});
test("alias-only, ambiguous and differently padded labels reserve the number", async () => {
  await db.insert(itemIdentitiesTable).values(["a", "b"].map(id => ({ id, lineage: "unidentified", name: "Synthetic" })));
  await db.insert(itemIdentityAliasesTable).values(["a", "b"].map(identityId => ({ id: randomUUID(), identityId, alias: "DS-00006" })));
  assert.equal(await db.transaction(allocateItemDsId), "DS-0007");
  await assert.rejects(db.insert(itemIdentitiesTable).values({ id: "c", displayId: "DS-0006", lineage: "DS", name: "Synthetic" }));
});
test("allocation and JSON stay exact above JavaScript safe integer range", async () => {
  await db.insert(trackingCountersTable).values({ name: "item_ds", nextNumber: "9007199254740993" });
  const id = await db.transaction(allocateItemDsId);
  assert.equal(id, "DS-9007199254740993");
  await db.insert(itemIdentitiesTable).values({ id: "large", displayId: id, lineage: "DS", name: "Synthetic" });
  const [identity] = await db.select().from(itemIdentitiesTable);
  assert.equal(identity.dsNumber, "9007199254740993");
  assert.equal(JSON.parse(JSON.stringify(identity)).dsNumber, "9007199254740993");
  const [counter] = await db.select().from(trackingCountersTable);
  assert.equal(counter.nextNumber, "9007199254740994");
});

test("concurrent canonical reservations cannot give the same numeric value to two UUIDs", async () => {
  const results = await Promise.allSettled([
    db.insert(itemIdentitiesTable).values({ id: "race-a", displayId: "DS-0006", lineage: "DS", name: "Synthetic" }),
    db.insert(itemIdentitiesTable).values({ id: "race-b", displayId: "DS-00006", lineage: "DS", name: "Synthetic" }),
  ]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(results.filter(r => r.status === "rejected").length, 1);
  assert.equal((await db.select().from(itemDsReservationsTable)).length, 1);
});
