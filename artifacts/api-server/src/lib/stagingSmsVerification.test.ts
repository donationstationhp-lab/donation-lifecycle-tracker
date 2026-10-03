import assert from "node:assert/strict";
import test from "node:test";
import { stagingSmsIssues, verifyStagingSms, type StagingSmsConfig } from "./stagingSmsVerification";
import { TwilioSmsError } from "./twilio";

const accountSid = `AC${"a".repeat(32)}`;
const messageSid = `SM${"b".repeat(32)}`;
// Reserved fictional phone numbers, only used with an injected fake transport.
const config: StagingSmsConfig = {
  environment: "staging", accountSid, from: "+12025550100", to: "+12025550101",
  confirmRealSend: true, productionRuntime: false,
};
const base = { accountSid, messageSid };
const fake = {
  validate: async () => {},
  send: async () => ({ ...base, status: "queued" }),
  status: async () => ({ ...base, status: "delivered" }),
};

test("requires explicit staging account, recipient, sender and consent; refuses production", async () => {
  assert.deepEqual(stagingSmsIssues(config), []);
  for (const change of [
    { productionRuntime: true }, { environment: "production" }, { confirmRealSend: false },
    { accountSid: undefined }, { from: undefined }, { to: undefined },
    { to: "(202) 555-0101" }, { from: "2025550100" }, { to: config.from },
  ]) {
    const result = await verifyStagingSms({ ...config, ...change }, {
      transport: { ...fake, send: async () => { assert.fail("must not send"); } },
    });
    assert.equal(result.outcome, "BLOCKED");
    assert.ok(result.configurationIssues?.length);
  }
});

test("sends exactly once through the verification helper and requires delivered, not accepted", async () => {
  let sends = 0;
  let polls = 0;
  const result = await verifyStagingSms(config, {
    intervalMs: 1,
    transport: {
      ...fake,
      send: async (to, code, selected) => {
        sends++;
        assert.equal(to, config.to);
        assert.match(code, /^\d{6}$/);
        assert.deepEqual(selected, { accountSid, from: config.from });
        return { ...base, status: "queued" };
      },
      status: async () => ({ ...base, status: ++polls === 1 ? "sent" : "delivered" }),
    },
  });
  assert.equal(result.outcome, "PASS");
  assert.equal(sends, 1);
  assert.deepEqual(result.statuses, ["queued", "sent", "delivered"]);
  assert.equal(JSON.stringify(result).includes(config.to!), false);
  assert.equal(JSON.stringify(result).includes(config.from!), false);
});

test("surfaces trial account and credential errors without logging raw provider data", async () => {
  for (const [status, code, expected] of [[400, 21608, /trial account/], [401, 20003, /credentials/]] as const) {
    const result = await verifyStagingSms(config, {
      transport: { ...fake, validate: async () => { throw new TwilioSmsError("lookup", status, code); } },
    });
    assert.equal(result.outcome, "FAIL");
    assert.equal(result.providerCode, code);
    assert.match(result.reason, expected);
  }
});

test("reports failed delivery, timeout and mismatched account honestly", async () => {
  const failed = await verifyStagingSms(config, {
    intervalMs: 1, transport: { ...fake, status: async () => ({ ...base, status: "undelivered", errorCode: 30034 }) },
  });
  assert.equal(failed.outcome, "FAIL");
  assert.match(failed.reason, /A2P/);
  const timeout = await verifyStagingSms(config, { timeoutMs: 0, transport: fake });
  assert.equal(timeout.outcome, "INCONCLUSIVE");
  const mismatch = await verifyStagingSms(config, {
    transport: { ...fake, send: async () => ({ ...base, accountSid: `AC${"c".repeat(32)}`, status: "delivered" }) },
  });
  assert.equal(mismatch.outcome, "INCONCLUSIVE");
});