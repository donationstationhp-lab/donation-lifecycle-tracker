import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { db, donationItemsTable } from "@workspace/db";

const router: IRouter = Router();

// GET /dashboard
router.get("/dashboard", async (_req, res): Promise<void> => {
  const allItems = await db
    .select()
    .from(donationItemsTable)
    .orderBy(desc(donationItemsTable.createdAt));

  const totalItems = allItems.length;

  // Count by tier
  const tierCounts: Record<string, number> = { T: 0, I: 0, E: 0, R: 0 };
  for (const item of allItems) {
    if (item.tier in tierCounts) {
      tierCounts[item.tier]++;
    }
  }
  const byTier = Object.entries(tierCounts).map(([tier, count]) => ({ tier, count }));

  // Count by stage
  const stageCounts: Record<string, number> = {
    intake: 0,
    qc: 0,
    storage: 0,
    distributed: 0,
  };
  for (const item of allItems) {
    if (item.stage in stageCounts) {
      stageCounts[item.stage]++;
    }
  }
  const byStage = Object.entries(stageCounts).map(([stage, count]) => ({ stage, count }));

  // Recent items (last 5)
  const recentItems = allItems.slice(0, 5);

  // Count expiring within 14 days
  const now = new Date();
  let expiringCount = 0;
  for (const item of allItems) {
    if (item.expiryDate) {
      const expiryDate = new Date(item.expiryDate);
      const diffMs = expiryDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays <= 14) {
        expiringCount++;
      }
    }
  }

  res.json({ totalItems, byTier, byStage, recentItems, expiringCount });
});

export default router;
