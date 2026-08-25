/**
 * CLI-specific extra endpoints:
 *   GET  /export
 *   POST /import
 *   GET  /manifest/:routeName
 *   POST /routes/:name/stops
 *   GET  /metrics
 *   GET  /report
 */
import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  db,
  donationItemsTable,
  stageHistoryTable,
  deliveryRoutesTable,
  routeStopsTable,
  pickupRequestsTable,
} from "@workspace/db";

const router: IRouter = Router();

// ── Export ────────────────────────────────────────────────────────────────────
// GET /export — all items as JSON
router.get("/export", async (_req, res): Promise<void> => {
  const items = await db
    .select()
    .from(donationItemsTable)
    .orderBy(desc(donationItemsTable.createdAt));
  res.setHeader("Content-Type", "application/json");
  res.json(items);
});

// ── Import ────────────────────────────────────────────────────────────────────
// POST /import — bulk upsert items by database id
router.post("/import", async (req, res): Promise<void> => {
  const body = req.body;
  if (!Array.isArray(body)) {
    res.status(400).json({ error: "Body must be a JSON array of item objects" });
    return;
  }

  const now = new Date();
  const ids: string[] = [];

  for (const raw of body) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      res.status(400).json({ error: "Each imported item must be a JSON object" });
      return;
    }

    const item = raw as Record<string, unknown>;
    const id = item.id;
    if (id == null || String(id).trim() === "") {
      res.status(400).json({ error: "Each imported item must include an id" });
      return;
    }

    const itemId = item.itemId ?? item.item_id ?? id;
    const name = item.name;
    if (name == null || String(name).trim() === "") {
      res.status(400).json({ error: `Imported item ${String(id)} is missing name` });
      return;
    }

    const values = {
      id: String(id),
      itemId: String(itemId),
      name: String(name),
      category: item.category != null ? String(item.category) : "General",
      tier: item.tier != null ? String(item.tier) : "R",
      condition: item.condition != null ? String(item.condition) : "good",
      donor: item.donor != null ? String(item.donor) : "Unknown",
      recipient: stringOrNull(item.recipient),
      location: stringOrNull(item.location),
      expiryDate: stringOrNull(item.expiryDate ?? item.expiry_date),
      temperatureZone: item.temperatureZone != null
        ? String(item.temperatureZone)
        : item.temp_zone != null
          ? String(item.temp_zone)
          : "ambient",
      weight: numberOrNull(item.weight),
      origin: stringOrNull(item.origin),
      lotNumber: String(item.lotNumber ?? item.lot_number ?? item.lot ?? generateLotNumber()),
      powerConnectionReading: String(
        item.powerConnectionReading ??
          item.power_connection_reading ??
          computeNumerology(now),
      ),
      stage: item.stage != null ? String(item.stage) : "intake",
      pendingReview: booleanOrDefault(item.pendingReview, false),
    };

    await db
      .insert(donationItemsTable)
      .values(values)
      .onConflictDoUpdate({
        target: donationItemsTable.id,
        set: {
          itemId: values.itemId,
          name: values.name,
          category: values.category,
          tier: values.tier,
          condition: values.condition,
          donor: values.donor,
          recipient: values.recipient,
          location: values.location,
          expiryDate: values.expiryDate,
          temperatureZone: values.temperatureZone,
          weight: values.weight,
          origin: values.origin,
          lotNumber: values.lotNumber,
          powerConnectionReading: values.powerConnectionReading,
          stage: values.stage,
          pendingReview: values.pendingReview,
          updatedAt: now,
        },
      });

    ids.push(values.id);
  }

  res.json({ imported: ids.length, ids });
});

// ── Manifest ──────────────────────────────────────────────────────────────────
// GET /manifest/:routeName
router.get("/manifest/:routeName", async (req, res): Promise<void> => {
  const routeName = Array.isArray(req.params.routeName)
    ? req.params.routeName[0]
    : req.params.routeName;

  const [route] = await db
    .select()
    .from(deliveryRoutesTable)
    .where(eq(deliveryRoutesTable.name, routeName));

  if (!route) {
    res.status(404).json({ error: `Route '${routeName}' not found` });
    return;
  }

  const stops = await db
    .select()
    .from(routeStopsTable)
    .where(eq(routeStopsTable.routeId, route.id))
    .orderBy(routeStopsTable.stopOrder);

  const stopsWithItems = await Promise.all(
    stops.map(async (stop) => {
      const [item] = stop.itemId
        ? await db
            .select()
            .from(donationItemsTable)
            .where(eq(donationItemsTable.id, stop.itemId))
        : [];
      const [pickup] = stop.pickupRequestId
        ? await db
            .select()
            .from(pickupRequestsTable)
            .where(eq(pickupRequestsTable.id, stop.pickupRequestId))
        : [];
      return {
        stop: stop.stopOrder,
        item_id: item?.itemId ?? pickup?.id ?? stop.itemId ?? stop.pickupRequestId,
        name: item?.name ?? pickup?.name ?? `(pickup ${pickup?.id ?? "unknown"})`,
        tier: item?.tier,
        condition: item?.condition,
        recipient: item?.recipient ?? null,
        location: item?.location ?? pickup?.address ?? null,
        temp_zone: item?.temperatureZone ?? "ambient",
        weight: item?.weight ?? null,
        expiry_date: item?.expiryDate ?? null,
        notes: stop.notes ?? null,
      };
    })
  );

  res.json({
    route: {
      id: route.id,
      name: route.name,
      date: route.date,
      status: route.status,
      notes: route.notes ?? null,
    },
    generated_at: new Date().toISOString(),
    total_stops: stopsWithItems.length,
    stops: stopsWithItems,
  });
});

// ── Add stop to route by name ─────────────────────────────────────────────────
// POST /routes/:name/stops
router.post("/routes/:name/stops", async (req, res): Promise<void> => {
  const routeName = Array.isArray(req.params.name) ? req.params.name[0] : req.params.name;
  const { recipient, address, notes, itemId, item_id } = req.body ?? {};

  const [route] = await db
    .select()
    .from(deliveryRoutesTable)
    .where(eq(deliveryRoutesTable.name, routeName));

  if (!route) {
    res.status(404).json({ error: `Route '${routeName}' not found` });
    return;
  }

  // Determine next stop order
  const existingStops = await db
    .select({ stopOrder: routeStopsTable.stopOrder })
    .from(routeStopsTable)
    .where(eq(routeStopsTable.routeId, route.id))
    .orderBy(desc(routeStopsTable.stopOrder));

  const nextOrder = existingStops.length > 0 ? existingStops[0].stopOrder + 1 : 1;

  // Resolve itemId — can be provided directly or we look up by recipient name
  let resolvedItemId = itemId ?? item_id;
  if (!resolvedItemId && recipient) {
    const [found] = await db
      .select({ id: donationItemsTable.id })
      .from(donationItemsTable)
      .where(eq(donationItemsTable.recipient, String(recipient)));
    resolvedItemId = found?.id;
  }

  if (!resolvedItemId) {
    res.status(400).json({ error: "itemId or a known recipient is required to add a stop" });
    return;
  }

  const stopNotes = [
    notes ? String(notes) : null,
    address ? `Address: ${address}` : null,
  ].filter(Boolean).join(" | ") || null;

  const [stop] = await db
    .insert(routeStopsTable)
    .values({
      id: randomUUID(),
      routeId: route.id,
      itemId: String(resolvedItemId),
      stopOrder: nextOrder,
      notes: stopNotes,
    })
    .returning();

  res.status(201).json({ ...stop, stopOrder: nextOrder, routeName });
});

// ── Metrics ───────────────────────────────────────────────────────────────────
// GET /metrics
router.get("/metrics", async (_req, res): Promise<void> => {
  const allItems = await db.select().from(donationItemsTable);
  const allHistory = await db.select().from(stageHistoryTable);

  const total = allItems.length;

  // By stage
  const byStage: Record<string, number> = { intake: 0, qc: 0, storage: 0, distributed: 0 };
  for (const item of allItems) {
    byStage[item.stage] = (byStage[item.stage] ?? 0) + 1;
  }

  // By tier
  const byTier: Record<string, number> = { T: 0, I: 0, E: 0, R: 0 };
  for (const item of allItems) {
    byTier[item.tier] = (byTier[item.tier] ?? 0) + 1;
  }

  // Throughput per stage (transitions counted from history)
  const transitions: Record<string, number> = {};
  for (const h of allHistory) {
    const key = `${h.fromStage ?? "intake"}_to_${h.toStage}`;
    transitions[key] = (transitions[key] ?? 0) + 1;
  }

  // QC: entries where toStage = 'qc'
  const qcEntries = allHistory.filter((h) => h.toStage === "qc");
  const qcPassed = qcEntries.filter((h) => h.notes && h.notes.toLowerCase().includes("passed")).length;
  const qcFailed = qcEntries.filter((h) => h.notes && h.notes.toLowerCase().includes("failed")).length;
  const qcTotal = qcEntries.length;

  // Maintenance (notes mentioning maintenance)
  const maintenanceCount = allHistory.filter(
    (h) => h.notes && h.notes.toLowerCase().includes("maintenance")
  ).length;

  // Expiry stats
  const now = new Date();
  let expiringCount = 0;
  let expiredCount = 0;
  for (const item of allItems) {
    if (!item.expiryDate) continue;
    const diff = Math.ceil((new Date(item.expiryDate).getTime() - now.getTime()) / 86400000);
    if (diff < 0) expiredCount++;
    else if (diff <= 14) expiringCount++;
  }

  // Distribution rate
  const distributionRate =
    total > 0 ? Math.round((byStage.distributed / total) * 100) : 0;

  res.json({
    total_items: total,
    by_stage: byStage,
    by_tier: byTier,
    throughput: {
      transitions,
      distributed: byStage.distributed,
      distribution_rate_pct: distributionRate,
    },
    qc: {
      total: qcTotal,
      passed: qcPassed,
      failed: qcFailed,
      pass_rate_pct: qcTotal > 0 ? Math.round((qcPassed / qcTotal) * 100) : null,
    },
    maintenance: {
      total: maintenanceCount,
    },
    expiry: {
      expiring_within_14_days: expiringCount,
      already_expired: expiredCount,
    },
  });
});

// ── Report ────────────────────────────────────────────────────────────────────
// GET /report
router.get("/report", async (_req, res): Promise<void> => {
  const allItems = await db
    .select()
    .from(donationItemsTable)
    .orderBy(desc(donationItemsTable.createdAt));

  const now = new Date();

  const byStage: Record<string, number> = { intake: 0, qc: 0, storage: 0, distributed: 0 };
  const byTier: Record<string, number> = { T: 0, I: 0, E: 0, R: 0 };
  const byTempZone: Record<string, number> = { ambient: 0, refrigerated: 0, frozen: 0 };
  let expiredCount = 0;
  let expiringSoonCount = 0;

  for (const item of allItems) {
    byStage[item.stage] = (byStage[item.stage] ?? 0) + 1;
    byTier[item.tier] = (byTier[item.tier] ?? 0) + 1;
    byTempZone[item.temperatureZone] = (byTempZone[item.temperatureZone] ?? 0) + 1;
    if (item.expiryDate) {
      const diff = Math.ceil((new Date(item.expiryDate).getTime() - now.getTime()) / 86400000);
      if (diff < 0) expiredCount++;
      else if (diff <= 7) expiringSoonCount++;
    }
  }

  const recent = allItems.slice(0, 10).map((i) => ({
    item_id: i.itemId,
    name: i.name,
    tier: i.tier,
    stage: i.stage,
    donor: i.donor,
    created_at: i.createdAt,
  }));

  res.json({
    generated_at: now.toISOString(),
    summary: {
      total_items: allItems.length,
      by_stage: byStage,
      by_tier: byTier,
      by_temperature_zone: byTempZone,
    },
    alerts: {
      expired_items: expiredCount,
      expiring_within_7_days: expiringSoonCount,
    },
    recent_intakes: recent,
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function stringOrNull(value: unknown): string | null {
  if (value == null || String(value).trim() === "") return null;
  return String(value);
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function booleanOrDefault(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return fallback;
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

export default router;
