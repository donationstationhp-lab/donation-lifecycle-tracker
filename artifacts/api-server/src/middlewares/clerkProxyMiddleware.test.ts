import assert from "node:assert/strict";
import { createServer, request, type Server } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { gzipSync } from "node:zlib";
import { test, type TestContext } from "node:test";
import express from "express";
import {
  CLERK_PROXY_PATH,
  createClerkProxyMiddleware,
  getClerkProxyHost,
} from "./clerkProxyMiddleware";

const TEST_KEY = "synthetic-clerk-proxy-test-key";

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

async function fixture(
  t: TestContext,
  upstreamHandler: (req: IncomingMessage, res: ServerResponse) => void,
) {
  const upstream = createServer(upstreamHandler);
  const target = await listen(upstream);
  const app = express();
  app.use(CLERK_PROXY_PATH, createClerkProxyMiddleware(TEST_KEY, target));
  app.use((_req, res) => res.status(404).end());
  const downstream = createServer(app);
  const origin = await listen(downstream);
  t.after(async () => {
    await close(downstream);
    if (upstream.listening) await close(upstream);
  });
  return { origin, target, upstream };
}

function send(
  origin: string,
  path: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {},
) {
  return new Promise<{
    status: number;
    headers: IncomingMessage["headers"];
    body: Buffer;
  }>((resolve, reject) => {
    const req = request(
      origin,
      { path, method: options.method ?? "GET", headers: options.headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("error", reject);
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          }),
        );
      },
    );
    req.on("error", reject);
    req.setTimeout(5_000, () => req.destroy(new Error("Local proxy test timed out")));
    req.end(options.body);
  });
}

test("Clerk proxy preserves mounted paths, queries, trusted headers and origin", async (t) => {
  let upstreamRequest: IncomingMessage | undefined;
  const { origin, target } = await fixture(t, (req, res) => {
    upstreamRequest = req;
    res.end("ok");
  });
  const result = await send(origin, `${CLERK_PROXY_PATH}/v1/client?x=1`, {
    headers: {
      "x-forwarded-host": "tracker.example, internal.example",
      "x-forwarded-proto": "https",
      "x-forwarded-for": "192.0.2.2, 192.0.2.3",
      "clerk-secret-key": "untrusted-client-value",
    },
  });
  assert.equal(result.status, 200);
  assert.equal(upstreamRequest?.url, "/v1/client?x=1");
  assert.equal(upstreamRequest?.headers.host, new URL(target).host);
  assert.equal(upstreamRequest?.headers["clerk-secret-key"], TEST_KEY);
  assert.equal(
    upstreamRequest?.headers["clerk-proxy-url"],
    `https://tracker.example${CLERK_PROXY_PATH}`,
  );
  assert.equal(upstreamRequest?.headers["x-forwarded-for"], "192.0.2.2");
  assert.ok(!result.body.toString().includes(TEST_KEY));
});

test("Clerk proxy forwards POST bodies and cookies without consuming the stream", async (t) => {
  let receivedBody = "";
  let receivedCookie: string | undefined;
  const { origin } = await fixture(t, (req, res) => {
    receivedCookie = req.headers.cookie;
    req.setEncoding("utf8");
    req.on("data", (chunk) => { receivedBody += chunk; });
    req.on("end", () => {
      res.setHeader("set-cookie", ["a=1; HttpOnly; Secure", "b=2; Secure"]);
      res.end("ok");
    });
  });
  const body = '{"identifier":"synthetic@example.invalid"}';
  const result = await send(origin, `${CLERK_PROXY_PATH}/v1/client/sign_ins`, {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(body)),
      cookie: "test-session=synthetic",
    },
  });
  assert.equal(result.status, 200);
  assert.equal(receivedBody, body);
  assert.equal(receivedCookie, "test-session=synthetic");
  assert.deepEqual(result.headers["set-cookie"], ["a=1; HttpOnly; Secure", "b=2; Secure"]);
});

test("Clerk proxy buffers chunked responses and provides the exact content length", async (t) => {
  const { origin } = await fixture(t, (_req, res) => {
    res.setHeader("connection", "keep-alive");
    res.setHeader("keep-alive", "timeout=123");
    res.write("hello ");
    res.end("world");
  });
  const result = await send(origin, `${CLERK_PROXY_PATH}/v1/client`);
  assert.equal(result.body.toString(), "hello world");
  assert.equal(result.headers["content-length"], "11");
  assert.equal(result.headers["transfer-encoding"], undefined);
  // Node may add a downstream keep-alive header; do not forward the upstream one.
  assert.notEqual(result.headers["keep-alive"], "timeout=123");
});

test("Clerk proxy preserves compressed bytes, explicit lengths and redirect locations", async (t) => {
  const body = gzipSync("proxy response");
  const { origin } = await fixture(t, (_req, res) => {
    res.writeHead(302, {
      "content-length": String(body.length),
      "content-encoding": "gzip",
      location: "/v1/client",
    });
    res.end(body);
  });
  const result = await send(origin, `${CLERK_PROXY_PATH}/v1/client`);
  assert.equal(result.status, 302);
  assert.deepEqual(result.body, body);
  assert.equal(result.headers["content-length"], String(body.length));
  assert.equal(result.headers["content-encoding"], "gzip");
  assert.equal(result.headers.location, "/v1/client");
});

for (const status of [204, 304]) {
  test(`Clerk proxy preserves bodyless ${status} responses`, async (t) => {
    const { origin } = await fixture(t, (_req, res) => {
      res.statusCode = status;
      res.end();
    });
    const result = await send(origin, `${CLERK_PROXY_PATH}/v1/client`);
    assert.equal(result.status, status);
    assert.equal(result.body.length, 0);
  });
}

test("Clerk proxy preserves HEAD response metadata without a body", async (t) => {
  const { origin } = await fixture(t, (_req, res) => {
    res.setHeader("content-length", "100");
    res.end();
  });
  const result = await send(origin, `${CLERK_PROXY_PATH}/v1/client`, { method: "HEAD" });
  assert.equal(result.status, 200);
  assert.equal(result.headers["content-length"], "100");
  assert.equal(result.body.length, 0);
});

test("Deeply nested brace text in a URL is forwarded as data, never compiled", async (t) => {
  const path = "/" + "{".repeat(1_500) + "a" + "}".repeat(1_500);
  let observedPath = "";
  const { origin } = await fixture(t, (req, res) => {
    observedPath = req.url ?? "";
    res.end("ok");
  });
  const result = await send(origin, CLERK_PROXY_PATH + path);
  assert.equal(result.status, 200);
  assert.equal(decodeURI(observedPath), path);
  assert.equal((await send(origin, `${CLERK_PROXY_PATH}/v1/client`)).status, 200);
});

test("Clerk proxy stays confined to its mount path", async (t) => {
  let requests = 0;
  const { origin } = await fixture(t, (_req, res) => {
    requests++;
    res.end("ok");
  });
  assert.equal((await send(origin, "/api/items")).status, 404);
  assert.equal((await send(origin, "/api/__clerk-other/v1/client")).status, 404);
  assert.equal(requests, 0);
});

test("Unavailable Clerk upstream returns a controlled gateway error without credentials", async (t) => {
  const { origin, upstream } = await fixture(t, (_req, res) => res.end("ok"));
  await close(upstream);
  const result = await send(origin, `${CLERK_PROXY_PATH}/v1/client`);
  assert.equal(result.status, 504);
  assert.equal(result.body.length, 0);
  assert.ok(!JSON.stringify(result.headers).includes(TEST_KEY));
});

test("Clerk proxy host uses the first forwarded host or falls back to Host", () => {
  assert.equal(getClerkProxyHost({ headers: { "x-forwarded-host": ["a.example, b.example"] } }), "a.example");
  assert.equal(getClerkProxyHost({ headers: { host: " fallback.example " } }), "fallback.example");
  assert.equal(getClerkProxyHost({ headers: {} }), undefined);
});
