import assert from "node:assert/strict";
import express from "express";
import test from "node:test";
import healthRouter from "./health";

const app = express();
app.use("/api", healthRouter);

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

test("API artifact root and explicit health endpoint are public", async () => {
  const server = await startTestServer();
  try {
    for (const path of ["/api", "/api/healthz"]) {
      const response = await fetch(`${server.baseUrl}${path}`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { status: "ok" });
    }
  } finally {
    await server.close();
  }
});