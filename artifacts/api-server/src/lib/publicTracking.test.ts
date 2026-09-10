import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import {
  claimsTable,
  db,
  trackingOtpsTable,
} from "@workspace/db";
import {
  buildPublicImpactSummary,
  buildPublicTrackingResponse,
  cleanupExpiredTrackingOtps,
  publicClaimStatusLabel,
  safeCategory,
  safeItemName,
  TRACKING_OTP_RETENTION_MS,
} from "../routes/publicTrack";
import { buildPublicActivityTimeline } from "./publicServiceActivity";
import { buildPublicResourceCatalog } from "./publicItemLabels";

test("public item labels never echo unknown free-form content", () => {
  const privateName = "Donation for Jane Doe, 123 Main Street, jane@example.com";
  const privateCategory = "Smith family request";

  assert.equal(safeCategory(privateCategory), "Donation");
  assert.equal(safeItemName(privateName, privateCategory), "Donation item");
});

test("known categories and items resolve only to curated labels", () => {
  assert.equal(safeCategory("FOOD"), "Food");
  assert.equal(
    safeItemName("Frozen chicken from Jane Doe at 123 Main Street", "Food"),
    "Frozen chicken",
  );
  assert.equal(
    safeItemName("Call 312-555-0100 about winter shirt", "Clothing"),
    "Shirt",
  );
});

test("public resource catalog aggregates only curated fields", () => {
  const catalog = buildPublicResourceCatalog([
    {
      name: "Winter shirt for Jane Doe at 123 Main Street",
      category: "Clothing",
      condition: "good",
    },
    {
      name: "Call 312-555-0100 about another shirt",
      category: "Clothing",
      condition: "good",
    },
  ]);

  assert.deepEqual(catalog, [{
    name: "Shirt",
    category: "Clothing",
    condition: "Good",
    availableCount: 2,
  }]);
  assert.deepEqual(Object.keys(catalog[0]).sort(), [
    "availableCount",
    "category",
    "condition",
    "name",
  ]);
  assert.equal(JSON.stringify(catalog).includes("Jane Doe"), false);
  assert.equal(JSON.stringify(catalog).includes("312-555-0100"), false);
});

test("public claim statuses use curated language", () => {
  assert.equal(publicClaimStatusLabel("approved"), "Claim Approved");
  assert.equal(publicClaimStatusLabel("fulfilled"), "Completed");
  assert.equal(publicClaimStatusLabel("private_internal_status"), "In Progress");
});

test("public tracking builder returns only explicitly whitelisted keys", () => {
  const response = buildPublicTrackingResponse({
    trackingCode: "DSC-000001",
    status: "approved",
    updatedAt: new Date("2026-09-09T15:00:00Z"),
    itemName: "Frozen chicken",
    itemCategory: "Food",
    itemStage: "matched",
  }, [{
    status: "submitted",
    timestamp: new Date("2026-09-09T14:00:00Z"),
  }], true);

  assert.equal(response.exactTimesLocked, false);
  assert.equal(response.lastUpdatedExact?.toISOString(), "2026-09-09T15:00:00.000Z");
  assert.equal(response.timeline?.[0]?.exact?.toISOString(), "2026-09-09T14:00:00.000Z");
});

test("public impact counts only received transfers as distributions", () => {
  const summary = buildPublicImpactSummary({
    items: [
      { category: "Food", stage: "distributed" },
      { category: "Clothing", stage: "closed" },
    ],
    claims: [
      { id: "claim-1", status: "fulfilled" },
      { id: "claim-2", status: "approved" },
    ],
    history: [
      {
        claimId: "claim-1",
        status: "submitted",
        timestamp: new Date("2026-09-09T10:00:00Z"),
      },
      {
        claimId: "claim-1",
        status: "fulfilled",
        timestamp: new Date("2026-09-09T14:00:00Z"),
      },
    ],
    receivedTransfers: [
      { itemId: "item-1" },
      { itemId: "item-1" },
    ],
  });

  assert.equal(summary.totalItemsReceived, 2);
  assert.equal(summary.totalItemsDistributed, 1);
  assert.equal(summary.claimsFulfilled, 1);
  assert.equal(summary.averageFulfillmentHours, 4);
  assert.deepEqual(Object.keys(summary).sort(), [
    "averageFulfillmentHours",
    "claimsFulfilled",
    "itemsByCategory",
    "totalItemsDistributed",
    "totalItemsReceived",
  ]);
});

test("public service activity timeline whitelists labels and excludes private fields", () => {
  const timeline = buildPublicActivityTimeline([{
    activityType: "item_reservation",
    status: "reserved",
    createdAt: new Date("2026-09-09T15:00:00Z"),
    internalNotes: "Jane Doe, jane@example.com, 312-555-0100",
    staffOwner: "private-staff-id",
  } as Parameters<typeof buildPublicActivityTimeline>[0][number]]);

  assert.deepEqual(timeline, [{
    label: "Item Reserved",
    timestamp: new Date("2026-09-09T15:00:00Z"),
  }]);
  assert.equal(JSON.stringify(timeline).includes("Jane Doe"), false);
  assert.equal(JSON.stringify(timeline).includes("private-staff-id"), false);
});

test("tracking OTP cleanup retains active and recently consumed codes", async (t) => {
  const [claim] = await db
    .select({ id: claimsTable.id })
    .from(claimsTable)
    .limit(1);
  if (!claim) {
    t.skip("requires a seeded claim record");
    return;
  }

  const now = new Date("2026-09-10T12:00:00.000Z");
  const ids = {
    expired: randomUUID(),
    consumed: randomUUID(),
    active: randomUUID(),
    recent: randomUUID(),
    recentlyExpired: randomUUID(),
  };
  const retentionBoundary = now.getTime() - TRACKING_OTP_RETENTION_MS;

  await db.insert(trackingOtpsTable).values([
    {
      id: ids.expired,
      claimId: claim.id,
      codeHash: "expired",
      expiresAt: new Date(retentionBoundary - 1),
    },
    {
      id: ids.consumed,
      claimId: claim.id,
      codeHash: "consumed",
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      usedAt: new Date(retentionBoundary - 1),
    },
    {
      id: ids.active,
      claimId: claim.id,
      codeHash: "active",
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    },
    {
      id: ids.recent,
      claimId: claim.id,
      codeHash: "recent",
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      usedAt: new Date(now.getTime() - 1),
    },
    {
      id: ids.recentlyExpired,
      claimId: claim.id,
      codeHash: "recently-expired",
      expiresAt: new Date(now.getTime() - 1),
    },
  ]);

  try {
    const deletedCount = await cleanupExpiredTrackingOtps(
      now,
      TRACKING_OTP_RETENTION_MS,
      1,
    );
    assert.ok(deletedCount >= 2);

    const remaining = await db
      .select({ id: trackingOtpsTable.id })
      .from(trackingOtpsTable)
      .where(inArray(trackingOtpsTable.id, Object.values(ids)));
    assert.deepEqual(
      remaining.map(({ id }) => id).sort(),
      [ids.active, ids.recent, ids.recentlyExpired].sort(),
    );
  } finally {
    await db
      .delete(trackingOtpsTable)
      .where(inArray(trackingOtpsTable.id, Object.values(ids)));
  }
});
