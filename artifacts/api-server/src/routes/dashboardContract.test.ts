import test from "node:test";
import assert from "node:assert/strict";
import { GetDashboardResponse } from "@workspace/api-zod";

const dashboardResponse = {
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