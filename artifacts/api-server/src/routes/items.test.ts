import assert from "node:assert/strict";
import express from "express";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, donationItemsTable, donorsTable, pool } from "@workspace/db";
import itemsRouter from "./items";

const app = express();
app.use(express.json());
app.use(itemsRouter);

async function startTestServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not expose a TCP address");
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

test("duplicate generated item IDs return a conflict response", async () => {
  const id = randomUUID();
  const donor = `Duplicate item test donor ${randomUUID()}`;
  const itemId = "DS-1000";
  await db.insert(donationItemsTable).values({
    id,
    itemId,
    name: "Existing item",
    category: "equipment",
    tier: "R",
    condition: "good",
    donor,
    lotNumber: `LOT-${randomUUID()}`,
    powerConnectionReading: "",
  });

  const server = await startTestServer();
  const originalRandom = Math.random;
  Math.random = () => 0;

  try {
    const response = await fetch(`${server.baseUrl}/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Duplicate generated ID",
        category: "equipment",
        tier: "R",
        condition: "good",
        donor,
        lotNumber: `LOT-${randomUUID()}`,
      }),
    });

    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      error: "Generated item identifier already exists; please retry",
    });
    assert.equal(
      (await db.select().from(donationItemsTable).where(eq(donationItemsTable.itemId, itemId))).length,
      1,
    );
  } finally {
    Math.random = originalRandom;
    await db.delete(donationItemsTable).where(eq(donationItemsTable.id, id));
    await db.delete(donorsTable).where(eq(donorsTable.name, donor));
    await server.close();
  }
});

test.after(async () => {
  await pool.end();
});