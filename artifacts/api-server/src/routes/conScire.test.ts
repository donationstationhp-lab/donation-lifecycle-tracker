import assert from "node:assert/strict";
import express from "express";
import test from "node:test";
import type { ConScireCalendar } from "@workspace/api-zod";
import router from "./conScire";
import { STAGE_TO_POSITIONS, whenAllStages, whenWindows } from "../lib/conScire";

type CalendarJson = Omit<ConScireCalendar, "startDate"> & { startDate: string };

test("public calendar endpoint validates query parameters and returns single/all envelopes", async () => {
  const app = express();
  app.use("/api", router);
  // A request reaching an auth gate would fail; successful calendar requests never reach it.
  app.use((_req, res) => { res.status(401).json({ error: "Authentication required" }); });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api/con-scire/windows`;
  try {
    const response = await fetch(base);
    assert.equal(response.status, 200);
    const data = await response.json() as CalendarJson;
    assert.equal(data.days, 30);
    assert.equal(data.stage, undefined);
    assert.equal(data.windows, undefined);
    assert.deepEqual(data.stages, whenAllStages(new Date(data.startDate), 30));
    assert.ok(data.startDate.endsWith("T00:00:00.000Z"));
    assert.ok(data.stages);
    assert.deepEqual(Object.keys(data.stages), Object.keys(STAGE_TO_POSITIONS));

    for (const stage of Object.keys(STAGE_TO_POSITIONS)) {
      const response = await fetch(`${base}?stage=${stage}&days=90`);
      assert.equal(response.status, 200);
      const data = await response.json() as CalendarJson;
      assert.equal(data.stage, stage);
      assert.equal(data.days, 90);
      assert.equal(data.stages, undefined);
      assert.deepEqual(data.windows, whenWindows(stage, new Date(data.startDate), 90));
    }
    for (const query of [
      "days=0", "days=-1", "days=91", "days=1.5", "days=abc", "days=",
      "days=30&days=40", "stage=unknown", "stage=constructor", "stage=",
      "stage=intake&stage=qc", "stage[x]=intake",
    ]) {
      const response = await fetch(`${base}?${query}`);
      assert.equal(response.status, 400, query);
      const error = await response.json() as { error?: unknown };
      assert.equal(typeof error.error, "string");
    }
    assert.equal((await fetch(`${base}?days=1`)).status, 200);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});