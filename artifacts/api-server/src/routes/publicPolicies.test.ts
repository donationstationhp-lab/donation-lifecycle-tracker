import assert from "node:assert/strict";
import express from "express";
import test from "node:test";
import router from "./index";
import { pool } from "@workspace/db";

// Mount the actual API router to verify neither staff auth nor the /public
// database-availability gate intercepts these database-independent documents.
const app = express();
app.use("/api", router);
app.use((_req, res) => { res.status(404).send("Not found"); });

test("terms and privacy are public readable plain-text documents", async () => {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    for (const path of ["/api/terms", "/api/privacy"]) {
      const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type") ?? "", /^text\/plain;\s*charset=utf-8$/i);
      const text = await response.text();
      assert.match(text, /Donation Station HP/);
      assert.match(text, /reply STOP/i);
      assert.match(text, /info@donationsstations\.com/);
      assert.ok(text.length > 150);
      assert.doesNotMatch(text, /<!doctype|<html/i);
      if (path.endsWith("/terms")) {
        assert.match(text, /nonprofit/);
        assert.match(text, /single, non-marketing SMS/);
        assert.match(text, /item is distributed/);
      } else {
        assert.match(text, /phone numbers only for donor SMS notifications/);
        assert.match(text, /never share.*third parties for marketing/i);
        assert.match(text, /request deletion/i);
      }
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});

test.after(async () => { await pool.end(); });
