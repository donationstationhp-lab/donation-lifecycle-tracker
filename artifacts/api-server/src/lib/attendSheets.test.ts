import assert from "node:assert/strict";
import test, { after } from "node:test";
import { pool } from "@workspace/db";
import {
  canClaimOutboxLease,
  queueAttendSheetAppend,
  withAttendSheetAppendLock,
} from "./attendSheets";

after(async () => {
  await pool.end();
});

test("only pending or failed outbox records are eligible for an append lease", () => {
  assert.equal(canClaimOutboxLease("pending"), true);
  assert.equal(canClaimOutboxLease("failed"), true);
  assert.equal(canClaimOutboxLease("processing"), false);
  assert.equal(canClaimOutboxLease("sent"), false);
});

test("sheet appends are serialized to avoid concurrent table-boundary collisions", async () => {
  let active = 0;
  let maxActive = 0;
  const order: string[] = [];
  const adapter = {
    async append(row: readonly string[]) {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push(row[0] ?? "");
      active -= 1;
    },
  };

  await Promise.all([
    queueAttendSheetAppend(adapter, ["first"]),
    queueAttendSheetAppend(adapter, ["second"]),
  ]);

  assert.equal(maxActive, 1);
  assert.deepEqual(order, ["first", "second"]);
});

test("PostgreSQL coordinates sheet appends across concurrent delivery sessions", async () => {
  let active = 0;
  let maxActive = 0;

  await Promise.all([
    withAttendSheetAppendLock(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active -= 1;
    }),
    withAttendSheetAppendLock(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active -= 1;
    }),
  ]);

  assert.equal(maxActive, 1);
});
