import { Router, type IRouter } from "express";
import { eq, desc, and, like, ilike } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, donationItemsTable, stageHistoryTable, donorsTable } from "@workspace/db";
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
    sum = String(sum).split("").reduce((acc, d) => acc + parseInt(d, 10), 0);
  }
  return String(sum);
}

// Resolves an item's free-text `donor` field to a donor row, creating one
// if no case-insensitive name match exists. Keeps intake (staff form, CLI,
// public /donate form) working with a plain donor name while still linking
// items to a tracked donor for lifecycle purposes.
async function resolveDonorId(donorName: string): Promise<string> {
  const trimmed = donorName.trim();
  const [existing] = await db
    .select({ id: donorsTable.id })
    .from(donorsTable)
    .where(ilike(donorsTable.name, trimmed));
  if (existing) return existing.id;

  const id = randomUUID();
  await db.insert(donorsTable).values({ id, name: trimmed });
  return id;
}

async function getItemById(id: string) {
  const [item] = await db
    .select()
    .from(donationItemsTable)
    .where(eq(donationItemsTable.id, id));
  return item;
}

async function advanceStage(
  itemId: string,
  toStage: string,
  options: { by?: string; notes?: string; extra?: string } = {}
): Promise<void> {
  const [item] = await db
    .select({ stage: donationItemsTable.stage })
    .from(donationItemsTable)
    .where(eq(donationItemsTable.id, itemId));

  await db
    .update(donationItemsTable)
    .set({ stage: toStage, updatedAt: new Date() })
    .where(eq(donationItemsTable.id, itemId));

  const parts = [
    options.notes ?? null,
    options.by ? `By: ${options.by}` : null,
    options.extra ?? null,
  ].filter(Boolean);

  await db.insert(stageHistoryTable).values({
    id: randomUUID(),
    itemId,
    fromStage: item?.stage ?? null,
    toStage,
    notes: parts.length > 0 ? parts.join(" | ") : null,
  });
}

// ── GET /items ────────────────────────────────────────────────────────────────
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

  // ?pendingReview=true  → only pending items
  // ?pendingReview=false → only non-pending items
  // (omitted)            → all items
  const pendingReviewParam = req.query.pendingReview;
  if (pendingReviewParam === "true") {
    conditions.push(eq(donationItemsTable.pendingReview, true));
  } else if (pendingReviewParam === "false") {
    conditions.push(eq(donationItemsTable.pendingReview, false));
  }

  const items = await db
    .select()
    .from(donationItemsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(donationItemsTable.createdAt));

  res.json(items);
});

// ── POST /items ───────────────────────────────────────────────────────────────
// Accepts both standard field names and CLI aliases:
//   lot → lotNumber  |  temp_zone → temperatureZone  |  expiry_date → expiryDate
//   tier defaults to 'R' when omitted (CLI callers may omit it)
router.post("/items", async (req, res): Promise<void> => {
  const now = new Date();

  // Normalize CLI field aliases before Zod parsing
  const normalized = {
    ...req.body,
    lotNumber: req.body.lotNumber ?? req.body.lot,
    temperatureZone: req.body.temperatureZone ?? req.body.temp_zone ?? "ambient",
    expiryDate: req.body.expiryDate ?? req.body.expiry_date ?? undefined,
    tier: req.body.tier ?? "R",
  };

  const parsed = CreateItemBody.safeParse(normalized);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const id = randomUUID();
  const itemId = parsed.data.itemId ?? generateItemId();
  const lotNumber = parsed.data.lotNumber ?? generateLotNumber();
  const powerConnectionReading = parsed.data.powerConnectionReading ?? computeNumerology(now);
  const donorId = await resolveDonorId(parsed.data.donor);

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
      donorId,
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

  const historyParts = [
    "Item received at intake",
    req.body.notes ? `Notes: ${req.body.notes}` : null,
    req.body.by ? `By: ${req.body.by}` : null,
  ].filter(Boolean);

  await db.insert(stageHistoryTable).values({
    id: randomUUID(),
    itemId: id,
    fromStage: null,
    toStage: "intake",
    notes: historyParts.join(" | "),
  });

  res.status(201).json(item);
});

// ── GET /items/expiring  (must come before /:id) ──────────────────────────────
// ?days=N  →  flat list of items expiring within N days (CLI mode)
// (no ?days) → grouped urgency object (web app mode)
router.get("/items/expiring", async (req, res): Promise<void> => {
  const now = new Date();
  const daysParam = req.query.days;
  const flatMode = daysParam != null;
  const windowDays = flatMode ? Math.max(0, parseInt(String(daysParam), 10) || 2) : 14;

  const allItems = await db
    .select()
    .from(donationItemsTable)
    .orderBy(donationItemsTable.expiryDate);

  const withExpiry = allItems.filter((item) => item.expiryDate != null);

  if (flatMode) {
    // Return flat list of items expiring within `windowDays` days
    const result = withExpiry
      .map((item) => {
        const expiryDate = new Date(item.expiryDate!);
        const diffDays = Math.ceil((expiryDate.getTime() - now.getTime()) / 86400000);
        return { ...item, daysUntilExpiry: diffDays };
      })
      .filter((item) => item.daysUntilExpiry <= windowDays)
      .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

    res.json(result);
    return;
  }

  // Grouped mode for web app
  const expired: typeof withExpiry = [];
  const critical: typeof withExpiry = [];
  const warning: typeof withExpiry = [];
  const watch: typeof withExpiry = [];

  for (const item of withExpiry) {
    const expiryDate = new Date(item.expiryDate!);
    const diffDays = Math.ceil((expiryDate.getTime() - now.getTime()) / 86400000);
    const enriched = { ...item, urgency: "", daysUntilExpiry: diffDays };

    if (diffDays < 0) { enriched.urgency = "expired"; expired.push(enriched); }
    else if (diffDays <= 3) { enriched.urgency = "critical"; critical.push(enriched); }
    else if (diffDays <= 7) { enriched.urgency = "warning"; warning.push(enriched); }
    else if (diffDays <= 14) { enriched.urgency = "watch"; watch.push(enriched); }
  }

  res.json({ expired, critical, warning, watch });
});

// ── POST /items/:id/approve ───────────────────────────────────────────────────
// Clears the pendingReview flag, keeping the item at stage=intake for normal processing.
router.post("/items/:id/approve", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const item = await getItemById(id);
  if (!item) { res.status(404).json({ error: "Item not found" }); return; }

  const by = req.body?.by;

  await db
    .update(donationItemsTable)
    .set({ pendingReview: false, updatedAt: new Date() })
    .where(eq(donationItemsTable.id, id));

  await db.insert(stageHistoryTable).values({
    id: randomUUID(),
    itemId: id,
    fromStage: item.stage,
    toStage: item.stage,
    notes: ["Approved by staff — cleared for intake processing", by ? `By: ${by}` : null]
      .filter(Boolean)
      .join(" | "),
  });

  const updated = await getItemById(id);
  res.json(updated);
});

// ── POST /items/:id/qc ───────────────────────────────────────────────────────
// Body: { passed: bool, by?: string, notes?: string, maintenance?: string }
router.post("/items/:id/qc", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const item = await getItemById(id);
  if (!item) { res.status(404).json({ error: "Item not found" }); return; }

  const { passed, by, notes, maintenance } = req.body ?? {};
  const extra = [
    passed === true || passed === "true" ? "QC passed" : passed === false || passed === "false" ? "QC failed" : null,
    maintenance ? `Maintenance: ${maintenance}` : null,
  ].filter(Boolean).join(" | ") || undefined;

  await advanceStage(id, "qc", { by, notes, extra });

  const updated = await getItemById(id);
  res.json(updated);
});

// ── POST /items/:id/store ────────────────────────────────────────────────────
// Body: { location: string, by?: string, notes?: string }
router.post("/items/:id/store", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const item = await getItemById(id);
  if (!item) { res.status(404).json({ error: "Item not found" }); return; }

  const { location, by, notes } = req.body ?? {};

  if (location) {
    await db
      .update(donationItemsTable)
      .set({ location: String(location) })
      .where(eq(donationItemsTable.id, id));
  }

  await advanceStage(id, "storage", { by, notes });

  const updated = await getItemById(id);
  res.json(updated);
});

// ── POST /items/:id/distribute ───────────────────────────────────────────────
// Body: { recipient: string, by?: string, notes?: string, substitution?: string }
router.post("/items/:id/distribute", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const item = await getItemById(id);
  if (!item) { res.status(404).json({ error: "Item not found" }); return; }

  const { recipient, by, notes, substitution } = req.body ?? {};

  if (recipient) {
    await db
      .update(donationItemsTable)
      .set({ recipient: String(recipient) })
      .where(eq(donationItemsTable.id, id));
  }

  const extra = substitution ? `Substitution: ${substitution}` : undefined;
  await advanceStage(id, "distributed", { by, notes, extra });

  const updated = await getItemById(id);
  res.json(updated);
});

// ── GET /items/:id ────────────────────────────────────────────────────────────
router.get("/items/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetItemParams.safeParse({ id: raw });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [item] = await db
    .select()
    .from(donationItemsTable)
    .where(eq(donationItemsTable.id, params.data.id));

  if (!item) { res.status(404).json({ error: "Item not found" }); return; }

  const history = await db
    .select()
    .from(stageHistoryTable)
    .where(eq(stageHistoryTable.itemId, item.id))
    .orderBy(stageHistoryTable.timestamp);

  res.json({ ...item, history });
});

// ── PATCH /items/:id ──────────────────────────────────────────────────────────
router.patch("/items/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UpdateItemParams.safeParse({ id: raw });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = UpdateItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [item] = await db
    .update(donationItemsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(donationItemsTable.id, params.data.id))
    .returning();

  if (!item) { res.status(404).json({ error: "Item not found" }); return; }

  res.json(item);
});

// ── DELETE /items/:id ─────────────────────────────────────────────────────────
router.delete("/items/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteItemParams.safeParse({ id: raw });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [item] = await db
    .delete(donationItemsTable)
    .where(eq(donationItemsTable.id, params.data.id))
    .returning();

  if (!item) { res.status(404).json({ error: "Item not found" }); return; }

  res.sendStatus(204);
});

// ── PATCH /items/:id/stage ────────────────────────────────────────────────────
router.patch("/items/:id/stage", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = AdvanceItemStageParams.safeParse({ id: raw });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = AdvanceItemStageBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [existing] = await db
    .select()
    .from(donationItemsTable)
    .where(eq(donationItemsTable.id, params.data.id));

  if (!existing) { res.status(404).json({ error: "Item not found" }); return; }

  const [item] = await db
    .update(donationItemsTable)
    .set({ stage: parsed.data.stage, updatedAt: new Date() })
    .where(eq(donationItemsTable.id, params.data.id))
    .returning();

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
