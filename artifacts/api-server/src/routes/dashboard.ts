import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, donationItemsTable, pickupFlagsTable, pickupRequestsTable } from "@workspace/db";
import { isActiveItemStage, isExpiringSoon } from "../lib/dashboardMetrics";

const router: IRouter = Router();

// GET /dashboard
router.get("/dashboard", async (_req, res): Promise<void> => {
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

  res.json({
    totalActiveItems,
    byTier,
    byStage,
    recentItems,
    expiringCount,
    pendingReviewCount,
    pickupsPendingVerification,
    pickupsConfirmedThisWeek,
    flaggedPickupValues,
  });
});

export default router;
