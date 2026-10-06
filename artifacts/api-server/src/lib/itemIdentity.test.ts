import assert from "node:assert/strict";
import test, { after } from "node:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, donationItemsTable, pool, trackingCountersTable } from "@workspace/db";
import { allocateItemDsId, generateProvisionalItemId } from "./itemIdentity";

const COUNTER_NAME = "item_ds";

async function resetCounter(): Promise<void> {
  await db.delete(trackingCountersTable).where(eq(trackingCountersTable.name, COUNTER_NAME));
}

test("allocateItemDsId hands out distinct, sequential ids under concurrency", async () => {
  await resetCounter();
  try {
    const ids = await Promise.all(
      Array.from({ length: 8 }, () => db.transaction((tx) => allocateItemDsId(tx))),
    );
    assert.equal(new Set(ids).size, 8, "every concurrent intake must get a unique id");
    for (const id of ids) assert.match(id, /^DS-\d{4}$/);
  } finally {
    await resetCounter();
  }
});

test("allocateItemDsId skips a number already held by an existing item", async () => {
  await resetCounter();
  // First number this allocator hands out after a reset is DS-0006 (seeded at 5).
  const occupiedId = "DS-0006";
  const fixtureId = randomUUID();
  await db.insert(donationItemsTable).values({
    id: fixtureId,
    itemId: occupiedId,
    name: "Pre-existing item",
    category: "test",
    tier: "R",
    condition: "good",
    donor: "test donor",
    lotNumber: `LOT-${randomUUID()}`,
  });

  try {
    const allocated = await db.transaction((tx) => allocateItemDsId(tx));
    assert.notEqual(allocated, occupiedId);
    assert.match(allocated, /^DS-\d{4}$/);
  } finally {
    await db.delete(donationItemsTable).where(eq(donationItemsTable.id, fixtureId));
    await resetCounter();
  }
});

test("generateProvisionalItemId never touches the DS- counter", async () => {
  await resetCounter();
  const provisional = generateProvisionalItemId();
  assert.match(provisional, /^P-[0-9A-F]{8}$/);
  const rows = await db.select().from(trackingCountersTable).where(eq(trackingCountersTable.name, COUNTER_NAME));
  assert.equal(rows.length, 0, "a provisional id must never allocate from the DS- counter");
});

after(async () => {
  await pool.end();
});
