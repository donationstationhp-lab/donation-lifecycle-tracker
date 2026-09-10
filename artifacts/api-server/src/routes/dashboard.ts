import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, donationItemsTable, pickupFlagsTable, pickupRequestsTable, serviceActivitiesTable } from "@workspace/db";
import { GetDashboardResponse } from "@workspace/api-zod";
import { isActiveItemStage, isExpiringSoon } from "../lib/dashboardMetrics";
import { expireStaleReservations } from "./appointments";

const router: IRouter = Router();

// GET /dashboard
router.get("/dashboard", async (_req, res): Promise<void> => {
  await expireStaleReservations();
  const allItems = await db
    .select()
    .from(donationItemsTable)
    .orderBy(desc(donationItemsTable.createdAt));

  const activeItems = allItems.filter((item) => isActiveItemStage(item.stage));
  const totalActiveItems = activeItems.length;

  // Count by tier
  const tierCounts: Record<string, number> = { T: 0, I: 0, E: 0, R: 0 };
  for (const item of activeItems) {
    if (item.tier in tierCounts) tierCounts[item.tier]++;
  }
  const byTier = Object.entries(tierCounts).map(([tier, count]) => ({ tier, count }));

  // Count by stage
  const stageCounts: Record<string, number> = {
    intake: 0,
    qc: 0,
    storage: 0,
    matched: 0,
    scheduled: 0,
    distributed: 0,
    closed: 0,
  };
  for (const item of allItems) {
    if (item.stage in stageCounts) stageCounts[item.stage]++;
  }
  const byStage = Object.entries(stageCounts).map(([stage, count]) => ({ stage, count }));

  // Recent items (last 5, exclude pending)
  const recentItems = allItems.filter((i) => !i.pendingReview).slice(0, 5);

  // Count active items expiring today through the next 14 days.
  const now = new Date();
  const expiringCount = activeItems.filter((item) =>
    isExpiringSoon(item.expiryDate, now),
  ).length;

  // Count items awaiting staff review
  const pendingReviewCount = allItems.filter((i) => i.pendingReview).length;

  const pickups = await db.select().from(pickupRequestsTable);
  const flags = await db.select().from(pickupFlagsTable);
  const startOfWeek = new Date(now);
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

  const pickupsPendingVerification = pickups.filter((pickup) =>
    ["unverified", "contact_made"].includes(pickup.status),
  ).length;
  const pickupsConfirmedThisWeek = pickups.filter(
    (pickup) =>
      ["confirmed", "dispatched", "completed"].includes(pickup.status) &&
      pickup.updatedAt >= startOfWeek,
  ).length;
  const flaggedPickupValues = flags.length;
  const activities = await db.select().from(serviceActivitiesTable);
  const latestByAggregate = new Map<string, (typeof activities)[number]>();
  for (const activity of activities) {
    const aggregateId = activity.activityType === "acknowledgment"
      ? activity.parentActivityId
      : activity.relatedAppointmentId ?? activity.relatedPickupId ?? activity.relatedClaimId ?? activity.relatedItemId ?? activity.id;
    const key = `${activity.activityType}:${aggregateId ?? activity.id}`;
    const previous = latestByAggregate.get(key);
    if (!previous || activity.createdAt > previous.createdAt) latestByAggregate.set(key, activity);
  }
  const currentActivities = Array.from(latestByAggregate.values());
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay); endOfDay.setDate(endOfDay.getDate() + 1);
  const activeServiceStatuses = new Set(["submitted", "requested", "reserved", "confirmed", "in_progress", "planned", "released", "pending", "unverified", "contact_made", "dispatched"]);
  const receivedToday = activities.filter((a) => a.loopStage === "received" && a.createdAt >= startOfDay).length;
  const receivedThisWeek = activities.filter((a) => a.loopStage === "received" && a.createdAt >= startOfWeek).length;
  const scheduledToday = currentActivities.filter((a) => a.scheduledStart && a.scheduledStart >= startOfDay && a.scheduledStart < endOfDay && activeServiceStatuses.has(a.status)).length;
  const overdue = currentActivities.filter((a) => a.scheduledEnd && a.scheduledEnd < now && activeServiceStatuses.has(a.status)).length;
  const pendingVerification = currentActivities.filter((a) =>
    (a.activityType === "pickup" && ["unverified", "contact_made"].includes(a.status)) ||
    (a.activityType !== "pickup" && ["received", "recognized"].includes(a.loopStage) && activeServiceStatuses.has(a.status))
  ).length;
  const reservedItems = new Set(currentActivities.filter((a) => a.activityType === "item_reservation" && ["reserved", "confirmed", "in_progress"].includes(a.status)).map((a) => a.relatedItemId).filter(Boolean)).size;
  const completedDistributions = currentActivities.filter((a) => a.activityType === "distribution" && a.status === "completed").length;
  const acknowledgmentAggregates = new Map<string, { firstPending?: Date; firstSuccess?: Date; latest: (typeof activities)[number] }>();
  for (const activity of activities.filter((a) => a.activityType === "acknowledgment")) {
    const key = activity.parentActivityId ?? activity.id;
    const state = acknowledgmentAggregates.get(key) ?? { latest: activity };
    if (activity.status === "pending" && (!state.firstPending || activity.createdAt < state.firstPending)) state.firstPending = activity.createdAt;
    if (["sent", "acknowledged", "completed"].includes(activity.status) && activity.completedAt &&
        (!state.firstSuccess || activity.completedAt < state.firstSuccess)) state.firstSuccess = activity.completedAt;
    if (activity.createdAt > state.latest.createdAt) state.latest = activity;
    acknowledgmentAggregates.set(key, state);
  }
  const acknowledgments = Array.from(acknowledgmentAggregates.values());
  const acknowledged = acknowledgments.filter((a) =>
    a.firstPending && a.firstSuccess &&
    a.firstSuccess.getTime() <= a.firstPending.getTime() + 24 * 60 * 60 * 1000
  ).length;
  const terminalAppointments = currentActivities.filter((a) =>
    ["appointment", "item_reservation", "volunteer_shift", "pickup", "dropoff", "barter_handoff"].includes(a.activityType) &&
    ["completed", "no_show"].includes(a.status));
  const noShows = terminalAppointments.filter((a) => a.status === "no_show").length;
  const appointmentsCompleted = terminalAppointments.filter((a) => a.status === "completed").length;
  const acknowledgmentsPending = acknowledgments.filter((a) => ["pending", "overdue"].includes(a.latest.status)).length;
  const acknowledgmentsSent = acknowledgments.filter((a) => ["sent", "acknowledged", "completed"].includes(a.latest.status)).length;
  const acknowledgmentsReceived = acknowledgments.length;
  const requestsReceived = new Set(activities
    .filter((a) => a.activityType === "claim_request" && a.status === "submitted")
    .map((a) => a.relatedClaimId)
    .filter(Boolean)).size;
  const claimsVerified = new Set(activities
    .filter((a) => a.activityType === "claim_request" && ["verified", "approved"].includes(a.status))
    .map((a) => a.relatedClaimId)
    .filter(Boolean)).size;
  const appointmentsScheduled = new Set(activities
    .filter((a) =>
      ["appointment", "item_reservation", "volunteer_shift", "pickup", "dropoff", "barter_handoff"].includes(a.activityType) &&
      a.status === "confirmed")
    .map((a) => a.relatedAppointmentId ?? a.relatedPickupId ?? a.id)).size;
  const resourcesVerified = allItems.filter((item) =>
    !item.pendingReview && ["storage", "matched", "scheduled", "distributed", "closed"].includes(item.stage)
  ).length;

  function averageHours(fromStage: string, toStage: string): number | null {
    const byTracking = new Map<string, { from?: Date; to?: Date }>();
    for (const activity of activities) {
      if (!activity.publicTrackingCode) continue;
      const pair = byTracking.get(activity.publicTrackingCode) ?? {};
      if (activity.loopStage === fromStage && (!pair.from || activity.createdAt < pair.from)) pair.from = activity.createdAt;
      if (activity.loopStage === toStage && (!pair.to || activity.createdAt < pair.to)) pair.to = activity.createdAt;
      byTracking.set(activity.publicTrackingCode, pair);
    }
    const values = Array.from(byTracking.values()).flatMap((pair) =>
      pair.from && pair.to && pair.to >= pair.from ? [(pair.to.getTime() - pair.from.getTime()) / 3_600_000] : []);
    return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10 : null;
  }

  res.json(GetDashboardResponse.parse({
    refreshedAt: now.toISOString(),
    totalActiveItems,
    byTier,
    byStage,
    recentItems,
    expiringCount,
    pendingReviewCount,
    pickupsPendingVerification,
    pickupsConfirmedThisWeek,
    flaggedPickupValues,
    serviceMetrics: {
      receivedToday, receivedThisWeek, scheduledToday, overdue,
      pendingVerification, reservedItems, completedDistributions,
      acknowledgmentOnTimeRate: acknowledgments.length ? Math.round(acknowledged / acknowledgments.length * 100) : null,
      noShowRate: terminalAppointments.length ? Math.round(noShows / terminalAppointments.length * 100) : null,
      receivedToServedHours: averageHours("received", "served"),
      requestToMatchedHours: averageHours("received", "matched"),
      scheduledToCompletedHours: averageHours("scheduled", "served"),
      wowMetrics: {
        resourcesReceived: allItems.length,
        requestsReceived,
        claimsVerified,
        resourcesVerified,
        resourcesReserved: reservedItems,
        appointmentsScheduled,
        resourcesDistributed: completedDistributions,
        wasteDiverted: completedDistributions,
        appointmentsCompleted,
        noShows,
        acknowledgmentsReceived,
        acknowledgmentsPending,
        acknowledgmentsSent,
        receiveToGiveHours: averageHours("received", "served"),
      },
    },
  }));
});

export default router;
