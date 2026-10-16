import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createApiKeyAuth } from "../middlewares/apiKeyAuth";
import router from "./network";

const app = express();
app.use(express.json());
app.use(createApiKeyAuth({
  getExpectedApiKey: () => "synthetic-network-key",
  getUserId: req => req.headers["x-fixture-role"] ? "fixture-network-user" : null,
  getRole: async req => {
    const role = req.headers["x-fixture-role"];
    return role === "staff" || role === "supervisor" || role === "community" ? role : null;
  },
}));
app.use(router);
let base: string;
let close: () => Promise<void>;
test.before(async () => {
  const server = app.listen(0);
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  base = `http://127.0.0.1:${address.port}`;
  close = () => new Promise(resolve => { server.closeAllConnections(); server.close(() => resolve()); });
});
test.after(async () => { await close(); });
test("network reads and writes reject signed-out, unassigned and community accounts", async () => {
  for (const role of [null, "unassigned", "community"]) {
    for (const method of ["GET", "POST"]) {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (role) headers["x-fixture-role"] = role;
      const response = await fetch(`${base}/network`, {
        method, headers, body: method === "POST" ? JSON.stringify({ action: "createAgent" }) : undefined,
      });
      assert.equal(response.status, role ? 403 : 401);
    }
  }
});
test("automation cannot impersonate named staff; assigned staff and supervisor reach validation", async () => {
  const key = await fetch(`${base}/network`, {
    method: "POST", headers: { "content-type": "application/json", "x-api-key": "synthetic-network-key" },
    body: JSON.stringify({ action: "createAgent" }),
  });
  assert.equal(key.status, 403);
  for (const role of ["staff", "supervisor"]) {
    const response = await fetch(`${base}/network`, {
      method: "POST", headers: { "content-type": "application/json", "x-fixture-role": role },
      body: JSON.stringify({ action: "not-a-command" }),
    });
    assert.equal(response.status, 400);
  }
});
test("standard site initialization is supervisor-only and requires explicit confirmation", async () => {
  for (const role of [null, "unassigned", "community", "staff"]) {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (role) headers["x-fixture-role"] = role;
    const response = await fetch(`${base}/network/initialize-sites`, {
      method: "POST", headers, body: JSON.stringify({ confirmed: true }),
    });
    assert.equal(response.status, role ? 403 : 401);
  }
  const automation = await fetch(`${base}/network/initialize-sites`, {
    method: "POST", headers: { "content-type": "application/json", "x-api-key": "synthetic-network-key" },
    body: JSON.stringify({ confirmed: true }),
  });
  assert.equal(automation.status, 403);
  for (const body of [{}, { confirmed: false }]) {
    const response = await fetch(`${base}/network/initialize-sites`, {
      method: "POST", headers: { "content-type": "application/json", "x-fixture-role": "supervisor" },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 400);
  }
});
