import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { inArray } from "drizzle-orm";
import { GetDashboardResponse } from "@workspace/api-zod";
import {
  claimsTable,
  db,
  donationItemsTable,
  pickupFlagsTable,
  pickupRequestsTable,
  pool,
  recipientAccountsTable,
  serviceActivitiesTable,
} from "@workspace/db";
import dashboardRouter from "./dashboard";

const dashboardResponse = {
  refreshedAt: "2026-09-10T12:00:00.000Z",
  totalActiveItems: 10,
  byTier: [{ tier: "T", count: 10 }],
  byStage: [{ stage: "storage", count: 10 }],
  recentItems: [],
  expiringCount: 1,
  pendingReviewCount: 2,
  pickupsPendingVerification: 3,
  pickupsConfirmedThisWeek: 4,
  flaggedPickupValues: 5,
  serviceMetrics: {
    receivedToday: 1,
    receivedThisWeek: 2,
    scheduledToday: 3,
    overdue: 4,
    pendingVerification: 5,
    reservedItems: 6,
    completedDistributions: 7,
    acknowledgmentOnTimeRate: 80,
    noShowRate: null,
    receivedToServedHours: 1.5,
    requestToMatchedHours: null,
    scheduledToCompletedHours: 2.5,
    wowMetrics: {
      resourcesReceived: 10,
      requestsReceived: 9,
      claimsVerified: 8,
      resourcesVerified: 7,
      resourcesReserved: 6,
      appointmentsScheduled: 5,
      resourcesDistributed: 4,
      wasteDiverted: 4,
      appointmentsCompleted: 3,
      noShows: 2,
      acknowledgmentsReceived: 1,
      acknowledgmentsPending: 1,
      acknowledgmentsSent: 0,
      receiveToGiveHours: 3.5,
    },
  },
};

test("dashboard contract includes every staff-facing service metric", () => {
  assert.equal(GetDashboardResponse.safeParse(dashboardResponse).success, true);
});

test("dashboard contract rejects missing or renamed service metrics", () => {
  const missingMetric = structuredClone(dashboardResponse) as any;
  delete missingMetric.serviceMetrics.wowMetrics.appointmentsCompleted;
  assert.equal(GetDashboardResponse.safeParse(missingMetric).success, false);

  const renamedMetric = structuredClone(dashboardResponse) as any;
  renamedMetric.serviceMetrics.wowMetrics.resourcesDistributedCount =
    renamedMetric.serviceMetrics.wowMetrics.resourcesDistributed;
  delete renamedMetric.serviceMetrics.wowMetrics.resourcesDistributed;
  assert.equal(GetDashboardResponse.safeParse(renamedMetric).success, false);
});

test("GET /dashboard calculates staff-facing metrics from service records", async (t) => {
  const existingRows = await Promise.all([
    db.select({ id: donationItemsTable.id }).from(donationItemsTable).limit(1),
    db.select({ id: pickupRequestsTable.id }).from(pickupRequestsTable).limit(1),
    db.select({ id: pickupFlagsTable.id }).from(pickupFlagsTable).limit(1),
    db.select({ id: serviceActivitiesTable.id }).from(serviceActivitiesTable).limit(1),
  ]);
  if (existingRows.some((rows) => rows.length > 0)) {
    t.skip("requires an empty dashboard dataset");
    return;
  }

  const runId = randomUUID();
  const itemIds = [`dashboard-item-a-${runId}`, `dashboard-item-b-${runId}`];
  const pickupIds = [`dashboard-pickup-a-${runId}`, `dashboard-pickup-b-${runId}`];
  const accountId = `dashboard-account-${runId}`;
  const claimId = `dashboard-claim-${runId}`;
  const activityIds = Array.from({ length: 7 }, (_, index) => `dashboard-activity-${index}-${runId}`);
  const now = new Date();
  const receivedAt = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  const servedAt = new Date(now);
  const scheduledStart = new Date(now.getTime() + 60 * 60 * 1000);
  const scheduledEnd = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const app = express();
  app.use(dashboardRouter);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  try {
    await db.insert(donationItemsTable).values([
      {
        id: itemIds[0],
        itemId: `DASH-A-${runId}`,
        name: "Verified dashboard item",
        category: "equipment",
        tier: "T",
        condition: "good",
        donor: "Dashboard test donor",
        lotNumber: `LOT-A-${runId}`,
        stage: "storage",
      },
      {
        id: itemIds[1],
        itemId: `DASH-B-${runId}`,
        name: "Pending dashboard item",
        category: "supplies",
        tier: "I",
        condition: "good",
        donor: "Dashboard test donor",
        lotNumber: `LOT-B-${runId}`,
        stage: "intake",
        pendingReview: true,
      },
    ]);
    await db.insert(recipientAccountsTable).values({
      id: accountId,
      name: "Dashboard test account",
      type: "household",
    });
    await db.insert(claimsTable).values({
      id: claimId,
      trackingCode: `DASH-${runId}`,
      accountId,
      itemId: itemIds[0],
      status: "approved",
      submittedBy: "dashboard-test",
      approvedBy: "dashboard-test",
    });
    await db.insert(pickupRequestsTable).values([
      {
        id: pickupIds[0],
        status: "unverified",
        phone: `dashboard-phone-a-${runId}`,
        address: "1 Test Street",
        requestedWindow: "morning",
      },
      {
        id: pickupIds[1],
        status: "confirmed",
        phone: `dashboard-phone-b-${runId}`,
        address: "2 Test Street",
        requestedWindow: "afternoon",
        updatedAt: now,
      },
    ]);
    await db.insert(pickupFlagsTable).values({
      id: `dashboard-flag-${runId}`,
      type: "phone",
      value: `dashboard-flag-value-${runId}`,
      reason: "Dashboard metric fixture",
      pickupRequestId: pickupIds[0],
    });
    await db.insert(serviceActivitiesTable).values([
      {
        id: activityIds[0],
        activityType: "donation",
        loopStage: "received",
        relatedItemId: itemIds[0],
        publicTrackingCode: `DASH-ITEM-${runId}`,
        status: "submitted",
        idempotencyKey: `${activityIds[0]}-key`,
        createdAt: receivedAt,
      },
      {
        id: activityIds[1],
        activityType: "distribution",
        loopStage: "served",
        relatedItemId: itemIds[0],
        publicTrackingCode: `DASH-ITEM-${runId}`,
        status: "completed",
        idempotencyKey: `${activityIds[1]}-key`,
        createdAt: servedAt,
      },
      {
        id: activityIds[2],
        activityType: "item_reservation",
        loopStage: "scheduled",
        relatedItemId: itemIds[0],
        status: "confirmed",
        scheduledStart,
        scheduledEnd,
        idempotencyKey: `${activityIds[2]}-key`,
        createdAt: now,
      },
      {
        id: activityIds[3],
        activityType: "claim_request",
        loopStage: "received",
        relatedClaimId: claimId,
        status: "submitted",
        idempotencyKey: `${activityIds[3]}-key`,
        createdAt: receivedAt,
      },
      {
        id: activityIds[4],
        activityType: "claim_request",
        loopStage: "recognized",
        relatedClaimId: claimId,
        status: "approved",
        idempotencyKey: `${activityIds[4]}-key`,
        createdAt: now,
      },
      {
        id: activityIds[5],
        activityType: "acknowledgment",
        loopStage: "recognized",
        parentActivityId: `dashboard-ack-${runId}`,
        status: "pending",
        idempotencyKey: `${activityIds[5]}-key`,
        createdAt: new Date(now.getTime() - 3 * 60 * 60 * 1000),
      },
      {
        id: activityIds[6],
        activityType: "acknowledgment",
        loopStage: "recognized",
        parentActivityId: `dashboard-ack-${runId}`,
        status: "acknowledged",
        idempotencyKey: `${activityIds[6]}-key`,
        createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      },
    ]);

    const requestStartedAt = Date.now();
    const response = await fetch(`http://127.0.0.1:${address.port}/dashboard`);
    assert.equal(response.status, 200);
    const body = await response.json() as typeof dashboardResponse;
    assert.equal(GetDashboardResponse.safeParse(body).success, true);
    const refreshedAt = Date.parse(body.refreshedAt);
    assert.equal(Number.isNaN(refreshedAt), false);
    assert.ok(refreshedAt >= requestStartedAt);
    assert.ok(refreshedAt <= Date.now());

    assert.deepEqual(
      {
        totalActiveItems: body.totalActiveItems,
        byTier: body.byTier,
        byStage: body.byStage,
        recentItemCount: body.recentItems.length,
        pendingReviewCount: body.pendingReviewCount,
        pickupsPendingVerification: body.pickupsPendingVerification,
        pickupsConfirmedThisWeek: body.pickupsConfirmedThisWeek,
        flaggedPickupValues: body.flaggedPickupValues,
      },
      {
        totalActiveItems: 2,
        byTier: [
          { tier: "T", count: 1 },
          { tier: "I", count: 1 },
          { tier: "E", count: 0 },
          { tier: "R", count: 0 },
        ],
        byStage: [
          { stage: "intake", count: 1 },
          { stage: "qc", count: 0 },
          { stage: "storage", count: 1 },
          { stage: "matched", count: 0 },
          { stage: "scheduled", count: 0 },
          { stage: "distributed", count: 0 },
          { stage: "closed", count: 0 },
        ],
        recentItemCount: 1,
        pendingReviewCount: 1,
        pickupsPendingVerification: 1,
        pickupsConfirmedThisWeek: 1,
        flaggedPickupValues: 1,
      },
    );
    assert.deepEqual(body.serviceMetrics, {
      receivedToday: 2,
      receivedThisWeek: 2,
      scheduledToday: 1,
      overdue: 0,
      pendingVerification: 1,
      reservedItems: 1,
      completedDistributions: 1,
      acknowledgmentOnTimeRate: 100,
      noShowRate: null,
      receivedToServedHours: 6,
      requestToMatchedHours: null,
      scheduledToCompletedHours: null,
      wowMetrics: {
        resourcesReceived: 2,
        requestsReceived: 1,
        claimsVerified: 1,
        resourcesVerified: 1,
        resourcesReserved: 1,
        appointmentsScheduled: 1,
        resourcesDistributed: 1,
        wasteDiverted: 1,
        appointmentsCompleted: 0,
        noShows: 0,
        acknowledgmentsReceived: 1,
        acknowledgmentsPending: 0,
        acknowledgmentsSent: 1,
        receiveToGiveHours: 6,
      },
    });
  } finally {
    await db.delete(serviceActivitiesTable).where(inArray(serviceActivitiesTable.id, activityIds));
    await db.delete(pickupFlagsTable).where(inArray(pickupFlagsTable.pickupRequestId, pickupIds));
    await db.delete(pickupRequestsTable).where(inArray(pickupRequestsTable.id, pickupIds));
    await db.delete(claimsTable).where(inArray(claimsTable.id, [claimId]));
    await db.delete(recipientAccountsTable).where(inArray(recipientAccountsTable.id, [accountId]));
    await db.delete(donationItemsTable).where(inArray(donationItemsTable.id, itemIds));
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test.after(async () => {
  await pool.end();
});