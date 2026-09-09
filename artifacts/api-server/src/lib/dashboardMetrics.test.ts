import assert from "node:assert/strict";
import test from "node:test";
import {
  isActiveItemStage,
  isExpiringSoon,
} from "./dashboardMetrics";

const now = new Date("2026-09-09T12:00:00.000Z");

test("only in-system stages count as active", () => {
  assert.equal(isActiveItemStage("intake"), true);
  assert.equal(isActiveItemStage("qc"), true);
  assert.equal(isActiveItemStage("storage"), true);
  assert.equal(isActiveItemStage("matched"), true);
  assert.equal(isActiveItemStage("scheduled"), true);
  assert.equal(isActiveItemStage("distributed"), false);
  assert.equal(isActiveItemStage("closed"), false);
  assert.equal(isActiveItemStage("archived"), false);
  assert.equal(isActiveItemStage("removed"), false);
});

test("expiring soon includes today through day 14, not expired or day 15", () => {
  assert.equal(isExpiringSoon("2026-09-08", now), false);
  assert.equal(isExpiringSoon("2026-09-09", now), true);
  assert.equal(isExpiringSoon("2026-09-23", now), true);
  assert.equal(isExpiringSoon("2026-09-24", now), false);
  assert.equal(isExpiringSoon(null, now), false);
});