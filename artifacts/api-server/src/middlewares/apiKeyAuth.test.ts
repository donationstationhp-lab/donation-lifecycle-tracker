import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";
import {
  createApiKeyAuth,
  requireSupervisor,
  type StaffRole,
} from "./apiKeyAuth";

const SERVER_API_KEY = "server-held-test-key";
const DONOR_PHONE = "555-0100";

type ResponseState = {
  statusCode: number;
  body: unknown;
  nextCalled: boolean;
  locals: Record<string, unknown>;
};

function runMiddleware({
  role,
  userId = role ? `clerk-${role}` : null,
  providedApiKey,
  expectedApiKey = SERVER_API_KEY,
}: {
  role: StaffRole | null;
  userId?: string | null;
  providedApiKey?: string;
  expectedApiKey?: string;
}): Promise<ResponseState> {
  const state: ResponseState = {
    statusCode: 200,
    body: undefined,
    nextCalled: false,
    locals: {},
  };
  const req = {
    headers: providedApiKey ? { "x-api-key": providedApiKey } : {},
  } as unknown as Request;
  const res = {
    locals: state.locals,
    status(code: number) {
      state.statusCode = code;
      return this;
    },
    json(body: unknown) {
      state.body = body;
      return this;
    },
  } as unknown as Response;
  const next = (() => {
    state.nextCalled = true;
  }) as NextFunction;

  return createApiKeyAuth({
    getRole: async () => role,
    getUserId: () => userId,
    getExpectedApiKey: () => expectedApiKey,
  })(req, res, next).then(() => state);
}

function assertDoesNotExposeSensitiveValues(
  body: unknown,
  ...sensitiveValues: string[]
) {
  const serialized = JSON.stringify(body) ?? "";
  for (const sensitiveValue of sensitiveValues) {
    assert.equal(
      serialized.includes(sensitiveValue),
      false,
      "authorization response must not expose sensitive values",
    );
  }
}

describe("staff privacy access matrix", () => {
  it("rejects signed-out requests before looking up a Clerk role", async () => {
    let roleLookupCount = 0;
    const result = await createApiKeyAuth({
      getRole: async () => {
        roleLookupCount += 1;
        return null;
      },
      getUserId: () => null,
      getExpectedApiKey: () => SERVER_API_KEY,
    })(
      { headers: {} } as unknown as Request,
      {
        locals: {},
        status(code: number) {
          return {
            json(body: unknown) {
              assert.equal(code, 401);
              assert.deepEqual(body, { error: "Staff sign-in required" });
            },
          };
        },
      } as unknown as Response,
      (() => undefined) as NextFunction,
    );

    assert.equal(result, undefined);
    assert.equal(roleLookupCount, 0);
  });

  it("allows only assigned staff roles through the Clerk path", async () => {
    const cases = [
      { name: "unassigned", role: null, status: 403, allowed: false },
      { name: "staff", role: "staff" as const, status: 200, allowed: true },
      {
        name: "supervisor",
        role: "supervisor" as const,
        status: 200,
        allowed: true,
      },
    ];

    for (const testCase of cases) {
      const result = await runMiddleware({
        role: testCase.role,
        userId: testCase.role ? `clerk-${testCase.role}` : "clerk-unassigned",
        providedApiKey: "not-the-server-key",
      });
      assert.equal(result.statusCode, testCase.status, testCase.name);
      assert.equal(result.nextCalled, testCase.allowed, testCase.name);
      if (testCase.allowed) {
        assert.equal(result.locals.staffRole, testCase.role);
        assert.equal(result.locals.authMethod, "clerk");
      } else {
        assert.deepEqual(result.body, {
          error: "Staff access has not been assigned",
        });
      }
      assertDoesNotExposeSensitiveValues(
        result.body,
        SERVER_API_KEY,
        DONOR_PHONE,
      );
    }
  });

  it("accepts the server-held API key without exposing it or donor contact data", async () => {
    const result = await runMiddleware({
      role: null,
      userId: null,
      providedApiKey: SERVER_API_KEY,
    });

    assert.equal(result.statusCode, 200);
    assert.equal(result.nextCalled, true);
    assert.equal(result.locals.staffRole, "supervisor");
    assert.equal(result.locals.authMethod, "api-key");
    assertDoesNotExposeSensitiveValues(
      result.body,
      SERVER_API_KEY,
      DONOR_PHONE,
    );
  });

  it("rejects an invalid API key without falling back to anonymous access", async () => {
    const result = await runMiddleware({
      role: null,
      userId: null,
      providedApiKey: "invalid-key",
    });

    assert.equal(result.statusCode, 401);
    assert.equal(result.nextCalled, false);
    assert.deepEqual(result.body, { error: "Staff sign-in required" });
    assertDoesNotExposeSensitiveValues(
      result.body,
      SERVER_API_KEY,
      DONOR_PHONE,
    );
  });
});

describe("supervisor-only flag approval", () => {
  function runSupervisorGuard(role: StaffRole) {
    const result: ResponseState = {
      statusCode: 200,
      body: undefined,
      nextCalled: false,
      locals: { staffRole: role },
    };
    requireSupervisor(
      {} as Request,
      {
        locals: result.locals,
        status(code: number) {
          result.statusCode = code;
          return {
            json(body: unknown) {
              result.body = body;
            },
          };
        },
      } as unknown as Response,
      (() => {
        result.nextCalled = true;
      }) as NextFunction,
    );
    return result;
  }

  it("keeps staff approval server-forbidden", () => {
    const result = runSupervisorGuard("staff");
    assert.equal(result.statusCode, 403);
    assert.equal(result.nextCalled, false);
    assert.deepEqual(result.body, { error: "Supervisor access required" });
  });

  it("allows supervisor approval to reach the mutation handler", () => {
    const result = runSupervisorGuard("supervisor");
    assert.equal(result.statusCode, 200);
    assert.equal(result.nextCalled, true);
  });
});