import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  db,
  deliveryRoutesTable,
  routeStopsTable,
  donationItemsTable,
  pickupRequestsTable,
} from "@workspace/db";
import {
  GetRouteParams,
  UpdateRouteParams,
  UpdateRouteBody,
  DeleteRouteParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

// GET /routes
router.get("/routes", async (_req, res): Promise<void> => {
  const routes = await db
    .select()
    .from(deliveryRoutesTable)
    .orderBy(desc(deliveryRoutesTable.createdAt));

  const allStops = await db.select().from(routeStopsTable);
  const stopCountMap: Record<string, number> = {};
  for (const stop of allStops) {
    stopCountMap[stop.routeId] = (stopCountMap[stop.routeId] ?? 0) + 1;
  }

  const result = routes.map((route) => ({
    ...route,
    stopCount: stopCountMap[route.id] ?? 0,
  }));

  res.json(result);
});

// POST /routes
// Accepts:
//   Standard: { name, date, notes?, stops? }
//   CLI:      { name, description?, date? }  (date defaults to today)
router.post("/routes", async (req, res): Promise<void> => {
  const { name, date, notes, description, stops } = req.body ?? {};

  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (Array.isArray(stops) && stops.some((stop: any) => stop?.pickupRequestId)) {
    res.status(400).json({ error: "Assign confirmed pickups from the pickup workflow" });
    return;
  }

  const routeDate =
    date ??
    new Date().toISOString().split("T")[0]; // default to today

  const routeNotes = notes ?? description ?? null;

  const id = randomUUID();
  const [route] = await db
    .insert(deliveryRoutesTable)
    .values({
      id,
      name: String(name),
      date: String(routeDate),
      status: "planned",
      notes: routeNotes ? String(routeNotes) : null,
    })
    .returning();

  // Insert stops if provided (standard web-app format)
  if (Array.isArray(stops) && stops.length > 0) {
    const stopValues = stops.map((stop: any) => ({
      id: randomUUID(),
      routeId: id,
      itemId: stop.itemId,
        pickupRequestId: null,
      stopOrder: stop.stopOrder,
      notes: stop.notes ?? null,
    }));
    await db.insert(routeStopsTable).values(stopValues);
  }

  const stopCount = Array.isArray(stops) ? stops.length : 0;
  res.status(201).json({ ...route, stopCount });
});

// GET /routes/:id
router.get("/routes/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetRouteParams.safeParse({ id: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [route] = await db
    .select()
    .from(deliveryRoutesTable)
    .where(eq(deliveryRoutesTable.id, params.data.id));

  if (!route) {
    res.status(404).json({ error: "Route not found" });
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
      return { ...stop, item: item ?? null, pickup: pickup ?? null };
    })
  );

  res.json({ ...route, stopCount: stops.length, stops: stopsWithItems });
});

// PATCH /routes/:id
router.patch("/routes/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UpdateRouteParams.safeParse({ id: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateRouteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (parsed.data.stops?.some((stop) => stop.pickupRequestId)) {
    res.status(400).json({ error: "Assign confirmed pickups from the pickup workflow" });
    return;
  }

  const { stops, date, ...routeFields } = parsed.data;
  if (stops !== undefined) {
    const existingPickupStops = await db
      .select({ pickupRequestId: routeStopsTable.pickupRequestId })
      .from(routeStopsTable)
      .where(eq(routeStopsTable.routeId, params.data.id));
    const hasWorkflowPickupStop = existingPickupStops.some(
      (stop) => stop.pickupRequestId !== null,
    );
    if (hasWorkflowPickupStop) {
      res.status(409).json({
        error: "Routes with pickup stops cannot replace their manifest through route editing",
      });
      return;
    }
  }

  const [route] = await db
    .update(deliveryRoutesTable)
    .set({
      ...routeFields,
      ...(date !== undefined ? { date: date.toISOString().slice(0, 10) } : {}),
    })
    .where(eq(deliveryRoutesTable.id, params.data.id))
    .returning();

  if (!route) {
    res.status(404).json({ error: "Route not found" });
    return;
  }

  if (stops !== undefined) {
    await db.delete(routeStopsTable).where(eq(routeStopsTable.routeId, route.id));
    if (stops.length > 0) {
      const stopValues = stops.map((stop) => ({
        id: randomUUID(),
        routeId: route.id,
        itemId: stop.itemId,
        pickupRequestId: stop.pickupRequestId ?? null,
        stopOrder: stop.stopOrder,
        notes: stop.notes ?? null,
      }));
      await db.insert(routeStopsTable).values(stopValues);
    }
  }

  const currentStops = await db
    .select()
    .from(routeStopsTable)
    .where(eq(routeStopsTable.routeId, route.id));

  res.json({ ...route, stopCount: currentStops.length });
});

// DELETE /routes/:id
router.delete("/routes/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteRouteParams.safeParse({ id: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [route] = await db
    .delete(deliveryRoutesTable)
    .where(eq(deliveryRoutesTable.id, params.data.id))
    .returning();

  if (!route) {
    res.status(404).json({ error: "Route not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
