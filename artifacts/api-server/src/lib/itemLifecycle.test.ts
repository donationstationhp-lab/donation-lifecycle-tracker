import assert from "node:assert/strict";
import test from "node:test";
import {
  ITEM_STAGE_FLOW,
  publicItemStageLabel,
  validateItemStageTransition,
} from "./itemLifecycle";

test("normal staff transitions cannot mimic claim or transfer events", () => {
  assert.deepEqual(validateItemStageTransition("intake", "qc", {}), { ok: true, override: false });
  assert.deepEqual(validateItemStageTransition("qc", "storage", {}), { ok: true, override: false });
  assert.deepEqual(validateItemStageTransition("distributed", "closed", {}), { ok: true, override: false });
  assert.equal(validateItemStageTransition("storage", "matched", {}).ok, false);
  assert.equal(validateItemStageTransition("matched", "scheduled", {}).ok, false);
  assert.equal(validateItemStageTransition("scheduled", "distributed", {}).ok, false);
  assert.equal(validateItemStageTransition("intake", "storage", {}).ok, false);
});

test("staff overrides require a nonblank reason", () => {
  assert.equal(
    validateItemStageTransition("storage", "intake", { override: true }).ok,
    false,
  );
  assert.equal(
    validateItemStageTransition("storage", "intake", {
      override: true,
      reason: " ",
    }).ok,
    false,
  );
  assert.deepEqual(
    validateItemStageTransition("storage", "intake", {
      override: true,
      reason: "Correcting an intake error",
    }),
    { ok: true, override: true },
  );
});

test("public item stages use curated language and hide unknown values", () => {
  assert.equal(publicItemStageLabel("qc"), "Quality Check");
  assert.equal(publicItemStageLabel("matched"), "Matched / Claimed");
  assert.equal(publicItemStageLabel("scheduled"), "Distribution Scheduled");
  assert.equal(publicItemStageLabel("private-internal-value"), "In Progress");
});