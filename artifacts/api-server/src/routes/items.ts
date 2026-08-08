import { Router, type IRouter } from "express";
import { eq, desc, and, like } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, donationItemsTable, stageHistoryTable } from "@workspace/db";
import {
  ListItemsQueryParams,
  CreateItemBody,
  GetItemParams,
  UpdateItemBody,
  UpdateItemParams,
  DeleteItemParams,
  AdvanceItemStageParams,
  AdvanceItemStageBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

function generateItemId(): string {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `DS-${num}`;
}

function generateLotNumber(): string {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `LOT-${num}`;
}

function computeNumerology(date: Date): string {
  const dateStr = date.toISOString().split("T")[0].replace(/-/g, "");
  let sum = dateStr.split("").reduce((acc, d) => acc + parseInt(d, 10), 0);
  while (sum > 9 && sum !== 11 && sum !== 22 && sum !== 33) {
    sum = sum.toString().split("").reduce((acc, d) => acc + parseInt(d, 10), 0);
  }
  return String(sum);
}

// GET /items
router.get("/items", async (req, res): Promise<void> => {
  const parsed = ListItemsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { stage, tier, category, temperatureZone, search } = parsed.data;

  const conditions = [];
  if (stage) conditions.push(eq(donationItemsTable.stage, stage));
  if (tier) conditions.push(eq(donationItemsTable.tier, tier));
  if (category) conditions.push(eq(donationItemsTable.category, category));
  if (temperatureZone) conditions.push(eq(donationItemsTable.temperatureZone, temperatureZone));
  if (search) conditions.push(like(donationItemsTable.name, `%${search}%`));

  const items = await db
    .select()
    .from(donationItemsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(donationItemsTable.createdAt));

  res.json(items);
});

// POST /items
router.post("/items", async (req, res): Promise<void> => {
  const parsed = CreateItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const now = new Date();
  const id = randomUUID();
  const itemId = parsed.data.itemId ?? generateItemId();
  const lotNumber = parsed.data.lotNumber ?? generateLotNumber();
  const powerConnectionReading = parsed.data.powerConnectionReading ?? computeNumerology(now);

  const [item] = await db
    .insert(donationItemsTable)
    .values({
      id,
      itemId,
      name: parsed.data.name,
      category: parsed.data.category,
      tier: parsed.data.tier,
      condition: parsed.data.condition,
      donor: parsed.data.donor,
      recipient: parsed.data.recipient ?? null,
      location: parsed.data.location ?? null,
      expiryDate: parsed.data.expiryDate ?? null,
      temperatureZone: parsed.data.temperatureZone ?? "ambient",
      weight: parsed.data.weight ?? null,
      origin: parsed.data.origin ?? null,
      lotNumber,
      powerConnectionReading,
      stage: "intake",
    })
    .returning();

  // Record intake history
  await db.insert(stageHistoryTable).values({
    id: randomUUID(),
    itemId: id,
    fromStage: null,
    toStage: "intake",
    notes: "Item received at intake",
  });

  res.status(201).json(item);
});

// GET /items/expiring  (must come before /:id)
router.get("/items/expiring", async (_req, res): Promise<void> => {
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

  const items = await db
    .select()
    .from(donationItemsTable)
    .where(
      and(
        // Not null expiry date - we'll filter in JS since drizzle isNotNull import varies
        eq(donationItemsTable.stage, "storage") // expiring items in storage are most relevant
      )
    )
    .orderBy(donationItemsTable.expiryDate);

  // Also get all items with expiry dates (not just storage)
  const allWithExpiry = await db
    .select()
    .from(donationItemsTable)
    .orderBy(donationItemsTable.expiryDate);

  const withExpiry = allWithExpiry.filter((item) => item.expiryDate != null);

  const expired: typeof withExpiry = [];
  const critical: typeof withExpiry = [];
  const warning: typeof withExpiry = [];
  const watch: typeof withExpiry = [];

  for (const item of withExpiry) {
    const expiryDate = new Date(item.expiryDate!);
    const diffMs = expiryDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    const enriched = { ...item, urgency: "", daysUntilExpiry: diffDays };

    if (diffDays < 0) {
      enriched.urgency = "expired";
      expired.push(enriched);
    } else if (diffDays <= 3) {
      enriched.urgency = "critical";
      critical.push(enriched);
    } else if (diffDays <= 7) {
      enriched.urgency = "warning";
      warning.push(enriched);
    } else if (diffDays <= 14) {
      enriched.urgency = "watch";
      watch.push(enriched);
    }
  }

  res.json({ expired, critical, warning, watch });
});

// GET /items/:id
router.get("/items/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetItemParams.safeParse({ id: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [item] = await db
    .select()
    .from(donationItemsTable)
    .where(eq(donationItemsTable.id, params.data.id));

  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  const history = await db
    .select()
    .from(stageHistoryTable)
    .where(eq(stageHistoryTable.itemId, item.id))
    .orderBy(stageHistoryTable.timestamp);

  res.json({ ...item, history });
});

// PATCH /items/:id
router.patch("/items/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UpdateItemParams.safeParse({ id: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [item] = await db
    .update(donationItemsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(donationItemsTable.id, params.data.id))
    .returning();

  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  res.json(item);
});

// DELETE /items/:id
router.delete("/items/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteItemParams.safeParse({ id: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [item] = await db
    .delete(donationItemsTable)
    .where(eq(donationItemsTable.id, params.data.id))
    .returning();

  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  res.sendStatus(204);
});

// PATCH /items/:id/stage
router.patch("/items/:id/stage", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = AdvanceItemStageParams.safeParse({ id: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = AdvanceItemStageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(donationItemsTable)
    .where(eq(donationItemsTable.id, params.data.id));

  if (!existing) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  const [item] = await db
    .update(donationItemsTable)
    .set({ stage: parsed.data.stage, updatedAt: new Date() })
    .where(eq(donationItemsTable.id, params.data.id))
    .returning();

  // Record stage transition
  await db.insert(stageHistoryTable).values({
    id: randomUUID(),
    itemId: item.id,
    fromStage: existing.stage,
    toStage: parsed.data.stage,
    notes: parsed.data.notes ?? null,
  });

  res.json(item);
});

export default router;
