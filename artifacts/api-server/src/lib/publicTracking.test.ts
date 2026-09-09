import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPublicImpactSummary,
  buildPublicTrackingResponse,
  publicClaimStatusLabel,
  safeCategory,
  safeItemName,
} from "../routes/publicTrack";
import { buildPublicActivityTimeline } from "./publicServiceActivity";

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
    itemName: "Frozen chicken for Jane Doe",
    itemCategory: "Food",
    itemStage: "matched",
    recipientName: "Jane Doe",
    phone: "312-555-0100",
    privateNotes: "Do not expose",
  } as Parameters<typeof buildPublicTrackingResponse>[0], [{
    status: "submitted",
    timestamp: new Date("2026-09-09T14:00:00Z"),
  }]);

  assert.deepEqual(Object.keys(response).sort(), [
    "exactTimesLocked",
    "item",
    "lastUpdatedApprox",
    "lastUpdatedExact",
    "stage",
    "status",
    "timeline",
    "trackingCode",
  ]);
  assert.equal(JSON.stringify(response).includes("Jane Doe"), false);
  assert.equal(JSON.stringify(response).includes("312-555-0100"), false);
  assert.equal(JSON.stringify(response).includes("Do not expose"), false);
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
    label: "Reserved",
    timestamp: new Date("2026-09-09T15:00:00Z"),
  }]);
  assert.equal(JSON.stringify(timeline).includes("Jane Doe"), false);
  assert.equal(JSON.stringify(timeline).includes("private-staff-id"), false);
});