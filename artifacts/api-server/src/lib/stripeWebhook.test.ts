import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { nextStage, planStripeEvent, verifyStripeSignature } from "./stripeWebhook";

const SECRET = "whsec_test";
const BODY = JSON.stringify({ id: "evt_1", type: "charge.succeeded" });
const NOW = 1_800_000_000;

function sign(body: string, timestamp: number, secret = SECRET): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

test("verifyStripeSignature accepts a valid v1 signature", () => {
  assert.equal(verifyStripeSignature(BODY, `t=${NOW},v1=${sign(BODY, NOW)}`, SECRET, NOW), true);
});

test("verifyStripeSignature accepts any matching v1 among several", () => {
  const header = `t=${NOW},v1=${"0".repeat(64)},v1=${sign(BODY, NOW)}`;
  assert.equal(verifyStripeSignature(BODY, header, SECRET, NOW), true);
});

test("verifyStripeSignature rejects a wrong secret, a changed body, or a missing header", () => {
  assert.equal(verifyStripeSignature(BODY, `t=${NOW},v1=${sign(BODY, NOW, "other")}`, SECRET, NOW), false);
  assert.equal(verifyStripeSignature(BODY + " ", `t=${NOW},v1=${sign(BODY, NOW)}`, SECRET, NOW), false);
  assert.equal(verifyStripeSignature(BODY, undefined, SECRET, NOW), false);
  assert.equal(verifyStripeSignature(BODY, "garbage", SECRET, NOW), false);
});

test("verifyStripeSignature rejects a timestamp outside the 5-minute tolerance", () => {
  const old = NOW - 301;
  assert.equal(verifyStripeSignature(BODY, `t=${old},v1=${sign(BODY, old)}`, SECRET, NOW), false);
});

test("nextStage follows the GIVE lifecycle", () => {
  assert.equal(nextStage(null, "customer"), "Prospect");
  assert.equal(nextStage("Active", "customer"), "Active");
  assert.equal(nextStage(null, "one-time-gift"), "First gift");
  assert.equal(nextStage("Prospect", "one-time-gift"), "First gift");
  assert.equal(nextStage("First gift", "one-time-gift"), "First gift");
  assert.equal(nextStage(null, "recurring-gift"), "Active");
  assert.equal(nextStage("First gift", "subscription"), "Active");
  assert.equal(nextStage("Active", "payment-failed"), "Lapsing");
  assert.equal(nextStage("Lapsing", "one-time-gift"), "Reactivated");
  assert.equal(nextStage("Lapsed", "subscription"), "Reactivated");
  assert.equal(nextStage("Reactivated", "recurring-gift"), "Reactivated");
});

test("planStripeEvent turns a succeeded charge into a dollar donation", () => {
  const action = planStripeEvent({
    type: "charge.succeeded",
    data: {
      object: {
        id: "ch_1",
        amount: 2500,
        created: NOW,
        customer: "cus_1",
        invoice: "in_1",
        billing_details: { email: "ada@example.org", name: "Ada" },
      },
    },
  });
  assert.deepEqual(action, {
    kind: "record-charge",
    status: "Received",
    chargeId: "ch_1",
    amount: 25,
    date: new Date(NOW * 1000).toISOString(),
    recurring: true,
    donor: { email: "ada@example.org", customerId: "cus_1", name: "Ada" },
  });
});

test("planStripeEvent falls back to receipt_email and marks one-time gifts", () => {
  const action = planStripeEvent({
    type: "charge.failed",
    data: { object: { id: "ch_2", amount: 1000, created: NOW, receipt_email: "bo@example.org", invoice: null } },
  });
  assert.equal(action.kind, "record-charge");
  if (action.kind !== "record-charge") return;
  assert.equal(action.status, "Failed");
  assert.equal(action.recurring, false);
  assert.equal(action.donor.email, "bo@example.org");
});

test("planStripeEvent maps refunds, customers, subscriptions, and ignores the rest", () => {
  assert.deepEqual(planStripeEvent({ type: "charge.refunded", data: { object: { id: "ch_3" } } }), {
    kind: "refund-charge",
    chargeId: "ch_3",
  });
  assert.deepEqual(
    planStripeEvent({ type: "customer.created", data: { object: { id: "cus_2", email: "cy@example.org", name: "Cy" } } }),
    { kind: "upsert-donor", event: "customer", donor: { email: "cy@example.org", customerId: "cus_2", name: "Cy" } },
  );
  assert.deepEqual(
    planStripeEvent({ type: "customer.subscription.created", data: { object: { customer: "cus_2" } } }),
    { kind: "upsert-donor", event: "subscription", donor: { email: null, customerId: "cus_2", name: null } },
  );
  assert.equal(planStripeEvent({ type: "invoice.paid", data: { object: {} } }).kind, "ignore");
});
