import assert from "node:assert/strict";
import express from "express";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, locationsTable, pool } from "@workspace/db";
import locationsRouter from "./locations";

const app = express();
app.use(express.json());
app.use(locationsRouter);

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

test("duplicate location codes return a conflict response", async () => {
  const id = randomUUID();
  const code = `TEST-${randomUUID()}`;
  await db.insert(locationsTable).values({
    id,
    code,
    zone: "test",
  });
  const server = await startTestServer();

  try {
    const response = await fetch(`${server.baseUrl}/locations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, zone: "test" }),
    });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      error: `Location code '${code}' already exists`,
    });
  } finally {
    await db.delete(locationsTable).where(eq(locationsTable.id, id));
    await server.close();
  }
});

test.after(async () => {
  await pool.end();
});