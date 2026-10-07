import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";
import {
  createApiKeyAuth,
  requireCommunity,
  requireStaff,
  requireSupervisor,
  type AppRole,
  type StaffRole,
} from "./apiKeyAuth";

const SERVER_API_KEY = "server-held-test-key";
const DONOR_PHONE = "555-0100";
const SESSION_TOKEN = "session-test-token";

type ResponseState = {
  statusCode: number;
  body: unknown;
  nextCalled: boolean;
  locals: Record<string, unknown>;
};

function makeResponse(state: ResponseState): Response {
  return {
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
}

function runMiddleware({
  clerkUserId = null,
  communityRole = null,
  providedApiKey,
  expectedApiKey = SERVER_API_KEY,
  sessionToken,
  sessionUserRole,
}: {
  clerkUserId?: string | null;
  communityRole?: AppRole | null;
  providedApiKey?: string;
  expectedApiKey?: string;
  sessionToken?: string;
  /** If set, the mocked session lookup succeeds with this staff role; a
   * sessionToken with no sessionUserRole simulates an expired/invalid cookie. */
  sessionUserRole?: StaffRole;
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
  const res = makeResponse(state);
  const next = (() => {
    state.nextCalled = true;
  }) as NextFunction;

  return createApiKeyAuth({
    getExpectedApiKey: () => expectedApiKey,
    getSessionToken: () => sessionToken,
    getSessionUser: async (token) =>
      sessionUserRole ? { id: `staff-${token}`, role: sessionUserRole } as never : null,
    getClerkUserId: () => clerkUserId,
    getCommunityRole: async () => communityRole,
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

describe("staff/supervisor access via session cookie (no Clerk)", () => {
  it("rejects a request with no API key, no session cookie, and no Clerk user", async () => {
    const result = await runMiddleware({ clerkUserId: null, communityRole: null });
    assert.equal(result.statusCode, 401);
    assert.equal(result.nextCalled, false);
    assert.deepEqual(result.body, { error: "Sign-in required" });
    assertDoesNotExposeSensitiveValues(result.body, SERVER_API_KEY, DONOR_PHONE);
  });

  it("accepts the server-held API key as supervisor, without exposing it", async () => {
    const result = await runMiddleware({ providedApiKey: SERVER_API_KEY });
    assert.equal(result.statusCode, 200);
    assert.equal(result.nextCalled, true);
    assert.equal(result.locals.staffRole, "supervisor");
    assert.equal(result.locals.authMethod, "api-key");
    assertDoesNotExposeSensitiveValues(result.body, SERVER_API_KEY, DONOR_PHONE);
  });

  it("rejects an invalid API key without falling back to anonymous access", async () => {
    const result = await runMiddleware({ providedApiKey: "invalid-key" });
    assert.equal(result.statusCode, 401);
    assert.equal(result.nextCalled, false);
    assertDoesNotExposeSensitiveValues(result.body, SERVER_API_KEY, DONOR_PHONE);
  });

  it("grants staff/supervisor access for a valid session cookie, bypassing Clerk entirely", async () => {
    const result = await runMiddleware({
      sessionToken: SESSION_TOKEN,
      sessionUserRole: "staff",
      clerkUserId: null, // no Clerk session at all — session cookie alone is sufficient
    });
    assert.equal(result.statusCode, 200);
    assert.equal(result.nextCalled, true);
    assert.equal(result.locals.staffRole, "staff");
    assert.equal(result.locals.authMethod, "session");
    assertDoesNotExposeSensitiveValues(result.body, SERVER_API_KEY, DONOR_PHONE);
  });

  it("grants supervisor access for a session user with the supervisor role", async () => {
    const result = await runMiddleware({
      sessionToken: SESSION_TOKEN,
      sessionUserRole: "supervisor",
    });
    assert.equal(result.locals.staffRole, "supervisor");
    assert.equal(result.locals.authMethod, "session");
  });

  it("falls through to the community check on an expired/invalid session cookie", async () => {
    const result = await runMiddleware({
      sessionToken: "stale-token",
      // sessionUserRole omitted: simulates getSessionUser returning null
      clerkUserId: "clerk-donor-1",
      communityRole: "community",
    });
    assert.equal(result.statusCode, 200);
    assert.equal(result.locals.authMethod, "clerk");
    assert.equal(result.locals.userRole, "community");
  });
});

describe("community access via Clerk only", () => {
  it("grants community access for a Clerk user with the community role", async () => {
    const result = await runMiddleware({
      clerkUserId: "clerk-donor-1",
      communityRole: "community",
    });
    assert.equal(result.statusCode, 200);
    assert.equal(result.nextCalled, true);
    assert.equal(result.locals.userRole, "community");
    assert.equal(result.locals.communityUserId, "clerk-donor-1");
    assert.equal(result.locals.authMethod, "clerk");
    assert.equal(result.locals.staffRole, undefined);
  });

  it("rejects a Clerk user without the community role", async () => {
    const result = await runMiddleware({
      clerkUserId: "clerk-staff-leftover",
      communityRole: null,
    });
    assert.equal(result.statusCode, 403);
    assert.deepEqual(result.body, { error: "Community access has not been assigned" });
    assertDoesNotExposeSensitiveValues(result.body, SERVER_API_KEY, DONOR_PHONE);
  });

  it("rejects when there is no session cookie and no Clerk user at all", async () => {
    const result = await runMiddleware({});
    assert.equal(result.statusCode, 401);
    assert.deepEqual(result.body, { error: "Sign-in required" });
  });
});

describe("community and staff route guards", () => {
  function runGuard(
    guard: typeof requireCommunity | typeof requireStaff,
    locals: Record<string, unknown>,
  ) {
    const result = { statusCode: 200, body: undefined as unknown, nextCalled: false };
    guard(
      {} as Request,
      {
        locals,
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

  it("lets a community role reach only the community router", () => {
    const community = runGuard(requireCommunity, {
      userRole: "community",
      authMethod: "clerk",
    });
    assert.equal(community.nextCalled, true);

    const staff = runGuard(requireStaff, {
      userRole: "community",
      authMethod: "clerk",
    });
    assert.equal(staff.statusCode, 403);
    assert.equal(staff.nextCalled, false);
  });

  it("lets a session-backed staff role reach the staff router but not community", () => {
    const staff = runGuard(requireStaff, {
      userRole: "staff",
      authMethod: "session",
      staffRole: "staff",
    });
    assert.equal(staff.nextCalled, true);

    const community = runGuard(requireCommunity, {
      userRole: "staff",
      authMethod: "session",
      staffRole: "staff",
    });
    assert.equal(community.statusCode, 403);
    assert.equal(community.nextCalled, false);
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
      makeResponse(result),
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
