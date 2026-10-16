import assert from "node:assert/strict";
import test from "node:test";
import type { NetworkEventInput } from "@workspace/api-zod";
import { chicagoDay, validDay, missingAgentDays, validateNetworkEvent } from "./networkRules";

const event: NetworkEventInput = {
  requestId: "00000000-0000-4000-8000-000000000001", kind: "internal_move",
  agentId: "a", toAgentId: "b", eventDate: "2026-10-16",
  items: [{ description: "Books", quantity: 2, unit: "boxes" }], containerCount: 2,
  estimatedPounds: null, recordingMode: "after transfer", actingEntity: "Donation Station",
};
test("calendar validation rejects impossible dates; Chicago date crosses UTC midnight correctly", () => {
  assert.equal(validDay("2026-02-30"), false);
  assert.equal(validDay("2028-02-29"), true);
  assert.equal(chicagoDay(new Date("2026-10-17T02:00:00Z")), "2026-10-16");
});
test("missing days are explicit gaps, not inferred Idle or Closed; today is not overdue", () => {
  assert.deepEqual(missingAgentDays([{ id: "a", joinedOn: "2026-10-13" }],
    [{ agentId: "a", day: "2026-10-14" }], "2026-10-16"),
  [{ agentId: "a", day: "2026-10-13" }, { agentId: "a", day: "2026-10-15" }]);
});
test("internal moves require two own sites, not recipients", () => {
  assert.doesNotThrow(() => validateNetworkEvent(event, "2026-10-16"));
  assert.throws(() => validateNetworkEvent({ ...event, toAgentId: "a" }, "2026-10-16"));
  assert.throws(() => validateNetworkEvent({ ...event, organizationId: "partner" }, "2026-10-16"));
});
test("supply requires one organization or incoming first name, never personal contact details", () => {
  const supply: NetworkEventInput = { ...event, kind: "supply_transfer", toAgentId: undefined, direction: "incoming", individualSource: "Sam" };
  assert.doesNotThrow(() => validateNetworkEvent(supply, "2026-10-16"));
  for (const name of ["Sam Jones", "sam@example.invalid", "773-555-0100"])
    assert.throws(() => validateNetworkEvent({ ...supply, individualSource: name }, "2026-10-16"));
  assert.throws(() => validateNetworkEvent({ ...supply, organizationId: "partner" }, "2026-10-16"));
  assert.throws(() => validateNetworkEvent({ ...supply, direction: "outgoing" }, "2026-10-16"));
});
test("future records are scheduled; live means Chicago today", () => {
  assert.throws(() => validateNetworkEvent({ ...event, eventDate: "2026-10-17" }, "2026-10-16"));
  assert.doesNotThrow(() => validateNetworkEvent({ ...event, eventDate: "2026-10-17", recordingMode: "scheduled" }, "2026-10-16"));
  assert.throws(() => validateNetworkEvent({ ...event, eventDate: "2026-10-15", recordingMode: "live" }, "2026-10-16"));
});
