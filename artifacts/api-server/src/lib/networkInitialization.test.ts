import assert from "node:assert/strict";
import test from "node:test";
import { eq, sql } from "drizzle-orm";
import { db, agentsTable, trackingCountersTable, recipientAccountsTable } from "@workspace/db";
import { isolateTestDatabase } from "../test/databaseIsolation";
import { initializeStandardAgents, planStandardAgents, STANDARD_AGENTS } from "./networkInitialization";
import { saveNetworkCommand } from "./network";

let cleanup: () => Promise<void>;
test.before(async () => { cleanup = await isolateTestDatabase(); });
test.beforeEach(async () => {
  await db.execute(sql`TRUNCATE agents, agent_days, tracking_counters, recipient_accounts`);
  await db.insert(trackingCountersTable).values([
    { name: "item_ds", nextNumber: 6396 }, { name: "claim", nextNumber: 500 },
  ]);
});
test.after(async () => { await cleanup(); });

test("initialization creates exactly the three approved sites and no organizations or DS allocations", async () => {
  assert.deepEqual(await initializeStandardAgents(), { created: 3, existing: 0 });
  const agents = await db.select().from(agentsTable).orderBy(agentsTable.number);
  assert.deepEqual(agents.map(a => ({
    number: a.number, fullName: a.fullName, shortName: a.shortName,
    address: a.address, type: a.type, status: a.status, notes: a.notes,
  })), [...STANDARD_AGENTS]);
  assert.ok(agents.every(a => a.owner === "CIA" && a.operator === "Donation Station" && a.sku === null));
  assert.equal((await db.select().from(recipientAccountsTable)).length, 0);
  assert.deepEqual((await db.select().from(trackingCountersTable)).map(c => c.nextNumber).sort(), [500, 6396]);
});
test("rerun is a no-op preserving IDs and all staff-edited nonidentity fields", async () => {
  await initializeStandardAgents();
  await db.update(agentsTable).set({
    address: "Staff-confirmed new address", notes: "Staff-edited notes",
    sku: "LOCAL-SKU", status: "seasonal",
  }).where(eq(agentsTable.number, 1));
  const before = await db.select().from(agentsTable).orderBy(agentsTable.number);
  assert.deepEqual(await initializeStandardAgents(), { created: 0, existing: 3 });
  assert.deepEqual(await db.select().from(agentsTable).orderBy(agentsTable.number), before);
});
test("partial existing seed set creates only missing sites", async () => {
  await db.insert(agentsTable).values({ ...STANDARD_AGENTS[1], id: "fixture-existing-market" });
  assert.deepEqual(await initializeStandardAgents(), { created: 2, existing: 1 });
  const [market] = await db.select().from(agentsTable).where(eq(agentsTable.number, 2));
  assert.equal(market.id, "fixture-existing-market");
});
test("a conflict at site three leaves missing sites one and two uncreated", async () => {
  await db.insert(agentsTable).values({ ...STANDARD_AGENTS[2], id: "fixture-conflict", fullName: "Different site" });
  const before = await db.select().from(agentsTable);
  await assert.rejects(() => initializeStandardAgents(), /#3.*identity conflict/);
  assert.deepEqual(await db.select().from(agentsTable), before);
});
test("same name under another number is a conflict, not a second site", async () => {
  await db.insert(agentsTable).values({ ...STANDARD_AGENTS[0], id: "fixture-wrong-number", number: 9 });
  await assert.rejects(() => initializeStandardAgents(), /#1.*identity conflict/);
  assert.equal((await db.select().from(agentsTable)).length, 1);
});
test("ambiguous duplicate names stop the entire initialization", async () => {
  await db.insert(agentsTable).values([
    { ...STANDARD_AGENTS[0], id: "fixture-one" },
    { ...STANDARD_AGENTS[0], id: "fixture-duplicate-name", number: 9 },
  ]);
  await assert.rejects(() => initializeStandardAgents(), /identity conflict/);
  assert.equal((await db.select().from(agentsTable)).length, 2);
});
test("concurrent supervisors initialize once and new agent numbering follows at four", async () => {
  const results = await Promise.all([initializeStandardAgents(), initializeStandardAgents()]);
  assert.deepEqual(results.map(r => r.created).sort(), [0, 3]);
  await saveNetworkCommand({ action: "createAgent", agent: {
    fullName: "Synthetic fourth site", shortName: "Fourth", address: "Synthetic address",
    type: "host-permitted", status: "planned", notes: "",
  } }, "fixture-supervisor");
  assert.deepEqual((await db.select().from(agentsTable).orderBy(agentsTable.number)).map(a => a.number), [1, 2, 3, 4]);
});
test("seed preflight checks the full set and never mutates its input", () => {
  const existing = [{ id: "fixture", number: 3, fullName: "Wrong site" }];
  const before = structuredClone(existing);
  assert.throws(() => planStandardAgents(existing), /#3.*identity conflict/);
  assert.deepEqual(existing, before);
});
