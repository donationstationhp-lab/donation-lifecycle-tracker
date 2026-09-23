import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import { staffAuth } from "./staffAuth";

function mockReq(overrides: Partial<Request> = {}): Request {
  return { headers: {}, cookies: {}, ...overrides } as Request;
}

function mockRes(): Response & { statusCode?: number; body?: unknown } {
  const res = {
    locals: {},
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  } as unknown as Response & { statusCode?: number; body?: unknown };
  return res;
}

test("staffAuth fails closed when the key is unset in production", () => {
  const original = process.env.NODE_ENV;
  delete process.env.DONATION_STATION_API_KEY;
  process.env.NODE_ENV = "production";
  try {
    const req = mockReq();
    const res = mockRes();
    let nextCalled = false;
    staffAuth(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
  } finally {
    process.env.NODE_ENV = original;
  }
});

test("staffAuth keeps the dev-fallback when the key is unset outside production", () => {
  const original = process.env.NODE_ENV;
  delete process.env.DONATION_STATION_API_KEY;
  process.env.NODE_ENV = "development";
  try {
    const req = mockReq();
    const res = mockRes();
    let nextCalled = false;
    staffAuth(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
    assert.equal(res.locals.staffRole, "supervisor");
    assert.equal(res.locals.authMethod, "dev-fallback");
  } finally {
    process.env.NODE_ENV = original;
  }
});

test("staffAuth accepts a valid API key regardless of NODE_ENV", () => {
  const originalEnv = process.env.NODE_ENV;
  const originalKey = process.env.DONATION_STATION_API_KEY;
  process.env.NODE_ENV = "production";
  process.env.DONATION_STATION_API_KEY = "test-key";
  try {
    const req = mockReq({ headers: { "x-api-key": "test-key" } });
    const res = mockRes();
    let nextCalled = false;
    staffAuth(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
    assert.equal(res.locals.staffRole, "supervisor");
    assert.equal(res.locals.authMethod, "api-key");
  } finally {
    process.env.NODE_ENV = originalEnv;
    process.env.DONATION_STATION_API_KEY = originalKey;
  }
});

test("staffAuth rejects a wrong API key with no session in production", () => {
  const originalEnv = process.env.NODE_ENV;
  const originalKey = process.env.DONATION_STATION_API_KEY;
  process.env.NODE_ENV = "production";
  process.env.DONATION_STATION_API_KEY = "real-key";
  try {
    const req = mockReq({ headers: { "x-api-key": "wrong-key" } });
    const res = mockRes();
    let nextCalled = false;
    staffAuth(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
  } finally {
    process.env.NODE_ENV = originalEnv;
    process.env.DONATION_STATION_API_KEY = originalKey;
  }
});
