import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, deliveryRoutesTable, routeStopsTable, donationItemsTable } from "@workspace/db";
import {
  GetRouteParams,
  CreateRouteBody,
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

  // Get stop counts per route
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
router.post("/routes", async (req, res): Promise<void> => {
  const parsed = CreateRouteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const id = randomUUID();
  const [route] = await db
    .insert(deliveryRoutesTable)
    .values({
      id,
      name: parsed.data.name,
      date: parsed.data.date,
      status: "planned",
      notes: parsed.data.notes ?? null,
    })
    .returning();

  // Insert stops if provided
  if (parsed.data.stops && parsed.data.stops.length > 0) {
    const stopValues = parsed.data.stops.map((stop) => ({
      id: randomUUID(),
      routeId: id,
      itemId: stop.itemId,
      stopOrder: stop.stopOrder,
      notes: stop.notes ?? null,
    }));
    await db.insert(routeStopsTable).values(stopValues);
  }

  const stopCount = parsed.data.stops?.length ?? 0;
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

  // Fetch items for each stop
  const stopsWithItems = await Promise.all(
    stops.map(async (stop) => {
      const [item] = await db
        .select()
        .from(donationItemsTable)
        .where(eq(donationItemsTable.id, stop.itemId));
      return { ...stop, item };
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

  const { stops, ...routeFields } = parsed.data;

  const [route] = await db
    .update(deliveryRoutesTable)
    .set(routeFields)
    .where(eq(deliveryRoutesTable.id, params.data.id))
    .returning();

  if (!route) {
    res.status(404).json({ error: "Route not found" });
    return;
  }

  // Replace stops if provided
  if (stops !== undefined) {
    await db.delete(routeStopsTable).where(eq(routeStopsTable.routeId, route.id));
    if (stops.length > 0) {
      const stopValues = stops.map((stop) => ({
        id: randomUUID(),
        routeId: route.id,
        itemId: stop.itemId,
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
