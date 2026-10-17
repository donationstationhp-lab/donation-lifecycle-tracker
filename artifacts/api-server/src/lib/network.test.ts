import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import {
  db, agentsTable, agentDaysTable, donationItemsTable, serviceActivitiesTable,
  trackingCountersTable, recipientAccountsTable, locationsTable,
} from "@workspace/db";
import type { NetworkEventInput } from "@workspace/api-zod";
import { SaveNetworkBody } from "@workspace/api-zod";
import { isolateTestDatabase } from "../test/databaseIsolation";
import { saveNetworkCommand, networkSnapshot, recordAgentReceipt } from "./network";
import { chicagoDay } from "./networkRules";

let cleanup: () => Promise<void>;
test.before(async () => { cleanup = await isolateTestDatabase(); });
test.beforeEach(async () => {
  await db.execute(sql`TRUNCATE item_ds_reservations, agents, agent_days, donation_items, service_activities,
    recipient_accounts, locations, tracking_counters`);
  await db.insert(agentsTable).values(["a", "b"].map((id, i) => ({
    id, number: i + 1, fullName: `Synthetic agent ${id}`, shortName: id,
    address: "Synthetic address", type: "CIA-provided", status: "active",
    joinedOn: "2026-10-01",
  })));
  await db.insert(trackingCountersTable).values([
    { name: "item_ds", nextNumber: 6396 }, { name: "claim", nextNumber: 500 },
  ]);
});
test.after(async () => { await cleanup(); });

const input = (overrides: Partial<NetworkEventInput> = {}): NetworkEventInput => ({
  requestId: randomUUID(), kind: "internal_move", agentId: "a", toAgentId: "b",
  eventDate: chicagoDay(), items: [{ description: "Synthetic books", quantity: 2, unit: "boxes" }],
  containerCount: 2, estimatedPounds: null, recordingMode: "live", actingEntity: "Donation Station", ...overrides,
});
async function partner() {
  return saveNetworkCommand({ action: "createPartner", partner: {
    name: "Synthetic pantry", profile: {
      organizationType: "pantry", area: "", contactChannel: "", website: "", hours: "",
      accepts: "food", refuses: "", capacity: "", urgentSignal: "", surplusSignal: "", idleSignal: "",
      visibility: "With", nodeStatus: "profile needed", dateJoined: chicagoDay(),
    },
  } }, "fixture-staff");
}
function receiptValues(id: string, receivingAgentId: string) {
  return {
    id, receivingAgentId, itemId: "DS-6396", name: "Synthetic receipt", category: "books",
    tier: "R", condition: "good", donor: "Synthetic donor", lotNumber: "SYNTHETIC",
  };
}
test("agent numbers serialize independently and never touch DS or claim counters", async () => {
  await Promise.all(Array.from({ length: 3 }, (_, i) => saveNetworkCommand({
    action: "createAgent", agent: { fullName: `Synthetic new ${i}`, shortName: `new${i}`,
      address: "Synthetic address", type: "host-permitted", status: "planned", notes: "", sku: null },
  }, "fixture-staff")));
  const rows = await db.select().from(agentsTable).orderBy(agentsTable.number);
  assert.deepEqual(rows.map(a => a.number), [1, 2, 3, 4, 5]);
  assert.ok(rows.slice(2).every(a => a.owner === "CIA" && a.operator === "Donation Station" && a.sku === null));
  assert.deepEqual((await db.select().from(trackingCountersTable)).map(c => c.nextNumber).sort(), [500, 6396]);
});
test("a receipt replaces Idle with Intake atomically and daily bounds come from inventory", async () => {
  await saveNetworkCommand({ action: "logDay", day: { agentId: "a", day: chicagoDay(), state: "Idle" } }, "fixture-staff");
  await db.transaction(async tx => {
    await recordAgentReceipt(tx, "a", "fixture-staff");
    await tx.insert(donationItemsTable).values(receiptValues("item", "a"));
  });
  const snapshot = await networkSnapshot();
  assert.equal(snapshot.days.length, 1);
  assert.equal(snapshot.days[0].state, "Intake");
  assert.equal(snapshot.days[0].firstDs, "DS-6396");
  assert.equal(snapshot.days[0].lastDs, "DS-6396");
  assert.equal(snapshot.days[0].itemCount, 1);
  await assert.rejects(() => saveNetworkCommand({
    action: "logDay", day: { agentId: "a", day: chicagoDay(), state: "Closed" },
  }, "fixture-staff"), /cannot be Idle or Closed/);
});
test("receipt rollback leaves no daily entry and invalid agent cannot become receipt provenance", async () => {
  await assert.rejects(() => db.transaction(async tx => {
    await recordAgentReceipt(tx, "a", "fixture-staff"); throw new Error("synthetic late failure");
  }), /synthetic late failure/);
  assert.equal((await db.select().from(agentDaysTable)).length, 0);
  await assert.rejects(() => db.transaction(tx => recordAgentReceipt(tx, "missing", "fixture-staff")), /existing agent/);
});
test("empty Intake is rejected; a missing date stays missing; calendar dates are validated", async () => {
  await assert.rejects(() => saveNetworkCommand({ action: "logDay", day: {
    agentId: "a", day: chicagoDay(), state: "Intake",
  } }, "fixture-staff"), /Intake requires/);
  await assert.rejects(() => saveNetworkCommand({ action: "logDay", day: {
    agentId: "a", day: "2026-02-30", state: "Closed",
  } }, "fixture-staff"), /valid calendar/);
  assert.ok((await networkSnapshot()).missingDays.length > 0);
  assert.equal((await db.select().from(agentDaysTable)).length, 0);
});
test("repeated movement requests produce one ledger event, no inventory or claim transfers", async () => {
  const event = input();
  const results = await Promise.all([1, 2].map(() => saveNetworkCommand({ action: "recordEvent", event }, "fixture-staff")));
  assert.equal(results[0].id, results[1].id);
  assert.equal((await db.select().from(serviceActivitiesTable)).length, 1);
  assert.equal((await db.select().from(donationItemsTable)).length, 0);
  await assert.rejects(() => saveNetworkCommand({
    action: "recordEvent", event: { ...event, containerCount: 3 },
  }, "fixture-staff"), /different details/);
  const snap = await networkSnapshot();
  assert.equal(snap.events[0].fromAgentId, "a");
  assert.equal(snap.events[0].toAgentId, "b");
  assert.equal(snap.events[0].estimatedPounds, null);
});
test("partners reuse recipient_accounts; legacy personal fields are not projected", async () => {
  const p = await partner();
  await db.update(recipientAccountsTable).set({ contactName: "Synthetic legacy person" }).where(eq(recipientAccountsTable.id, p.id));
  const snap = await networkSnapshot();
  assert.equal(snap.partners.length, 1);
  assert.equal(snap.partners[0].id, p.id);
  assert.equal(JSON.stringify(snap.partners).includes("Synthetic legacy person"), false);
});
test("supply acknowledgment appends immutable audit history and projects one transfer", async () => {
  const p = await partner();
  const result = await saveNetworkCommand({ action: "recordEvent", event: input({
    kind: "supply_transfer", toAgentId: undefined, direction: "outgoing", organizationId: p.id,
  }) }, "fixture-staff");
  await assert.rejects(() => saveNetworkCommand({ action: "acknowledge", id: result.id,
    acknowledgment: { acknowledgment: "confirmed with differences", note: "" } }, "fixture-staff"), /differences/);
  await saveNetworkCommand({ action: "acknowledge", id: result.id,
    acknowledgment: { acknowledgment: "confirmed with differences", note: "One box fewer." } }, "fixture-staff");
  await saveNetworkCommand({ action: "acknowledge", id: result.id,
    acknowledgment: { acknowledgment: "confirmed with differences", note: "One box fewer." } }, "fixture-staff");
  assert.equal((await db.select().from(serviceActivitiesTable)).length, 2);
  const snap = await networkSnapshot();
  assert.equal(snap.events.length, 1);
  assert.equal(snap.events[0].id, result.id);
  assert.equal(snap.events[0].acknowledgment, "confirmed with differences");
  const [child] = await db.select().from(serviceActivitiesTable).where(eq(serviceActivitiesTable.parentActivityId, result.id));
  await assert.rejects(() => saveNetworkCommand({ action: "acknowledge", id: child.id,
    acknowledgment: { acknowledgment: "confirmed", note: "" } }, "fixture-staff"), /original supply/);
});
test("concurrent acknowledgment writers append strictly ordered aggregate events", async () => {
  const p = await partner();
  const result = await saveNetworkCommand({ action: "recordEvent", event: input({
    kind: "supply_transfer", toAgentId: undefined, direction: "outgoing", organizationId: p.id,
  }) }, "fixture-staff");
  await Promise.all(["First synthetic note", "Second synthetic note"].map(note =>
    saveNetworkCommand({ action: "acknowledge", id: result.id,
      acknowledgment: { acknowledgment: "confirmed", note } }, "fixture-staff")));
  const rows = await db.select().from(serviceActivitiesTable).orderBy(serviceActivitiesTable.createdAt);
  assert.equal(rows.length, 3);
  assert.ok(rows[1].createdAt.getTime() > rows[0].createdAt.getTime());
  assert.ok(rows[2].createdAt.getTime() > rows[1].createdAt.getTime());
  const snap = await networkSnapshot();
  assert.equal(snap.events.length, 1);
  assert.equal(snap.events[0].acknowledgmentNote, rows[2].networkDetails!.acknowledgmentNote);
});
test("supply cannot reference individual recipient accounts; first-name incoming supply is allowed", async () => {
  await db.insert(recipientAccountsTable).values({ id: "person", name: "Synthetic person", type: "individual" });
  await assert.rejects(() => saveNetworkCommand({ action: "recordEvent", event: input({
    kind: "supply_transfer", toAgentId: undefined, direction: "incoming", organizationId: "person",
  }) }, "fixture-staff"), /not an individual/);
  await saveNetworkCommand({ action: "recordEvent", event: input({
    kind: "supply_transfer", toAgentId: undefined, direction: "incoming", individualSource: "Sam",
  }) }, "fixture-staff");
  assert.equal((await networkSnapshot()).events[0].individualSource, "Sam");
});
test("future scheduled supply remains an intention and cannot be confirmed early", async () => {
  const result = await saveNetworkCommand({ action: "recordEvent", event: input({
    kind: "supply_transfer", toAgentId: undefined, direction: "incoming", individualSource: "Sam",
    recordingMode: "scheduled", eventDate: "2099-01-01",
  }) }, "fixture-staff");
  await assert.rejects(() => saveNetworkCommand({ action: "acknowledge", id: result.id,
    acknowledgment: { acknowledgment: "confirmed", note: "" } }, "fixture-staff"), /future scheduled/);
  assert.equal((await networkSnapshot()).events[0].recordingMode, "scheduled");
});
test("shelves require an agent; legacy unassigned locations remain explicit until staff maps them", async () => {
  await db.insert(locationsTable).values({ id: "legacy", code: "SYN-OLD", zone: "books" });
  assert.equal((await networkSnapshot()).locations[0].agentId, null);
  await saveNetworkCommand({ action: "assignLocation", id: "legacy", agentId: "a" }, "fixture-staff");
  assert.equal((await networkSnapshot()).locations[0].agentId, "a");
  assert.equal(SaveNetworkBody.safeParse({ action: "createLocation", location: { code: "X", zone: "X" } }).success, false);
  await saveNetworkCommand({ action: "createLocation", location: { code: "SYN-NEW", zone: "books", agentId: "b" } }, "fixture-staff");
  assert.equal((await db.select().from(locationsTable)).length, 2);
});
