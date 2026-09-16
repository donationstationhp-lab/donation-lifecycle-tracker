import assert from "node:assert/strict";
import test from "node:test";
import { canCollectEvidence, validateClaimTransition, validateTransferTransition } from "./attendTransitions";

test("verification requires complete evidence", () => {
  assert.equal(validateClaimTransition("submitted", "verified", []).ok, false);
  assert.deepEqual(validateClaimTransition("submitted", "verified", [
    { kind: "identity", reference: "x", note: "x" },
    { kind: "eligibility", reference: "x", note: "x" },
    { kind: "need", reference: "x", note: "x" },
  ]), { ok: true, idempotent: false });
});
test("current status request is idempotent and terminal statuses cannot advance", () => {
  assert.deepEqual(validateClaimTransition("approved", "approved"), { ok: true, idempotent: true });
  assert.equal(validateClaimTransition("cancelled", "verified").ok, false);
  assert.deepEqual(validateTransferTransition("received", "received"), { ok: true, idempotent: true });
});
test("claims cannot be fulfilled outside transfer receipt", () => {
  assert.equal(validateClaimTransition("approved", "fulfilled").ok, false);
});
test("evidence collection closes once a claim leaves submitted", () => {
  assert.equal(canCollectEvidence("submitted").ok, true);
  assert.equal(canCollectEvidence("verified").ok, false);
  assert.equal(canCollectEvidence("approved").ok, false);
});