import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, locationsTable } from "@workspace/db";

const router: IRouter = Router();

// GET /locations
router.get("/locations", async (_req, res): Promise<void> => {
  const locations = await db
    .select()
    .from(locationsTable)
    .orderBy(locationsTable.code);
  res.json(locations);
});

// POST /locations
router.post("/locations", async (req, res): Promise<void> => {
  const { code, zone, capacity, description, temp_zone, tempZone } = req.body ?? {};

  if (!code || !zone) {
    res.status(400).json({ error: "code and zone are required" });
    return;
  }

  const id = randomUUID();
  try {
    const [location] = await db
      .insert(locationsTable)
      .values({
        id,
        code: String(code),
        zone: String(zone),
        capacity: capacity != null ? Number(capacity) : null,
        description: description ? String(description) : null,
        tempZone: String(temp_zone ?? tempZone ?? "ambient"),
      })
      .returning();
    res.status(201).json(location);
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: `Location code '${code}' already exists` });
    } else {
      throw err;
    }
  }
});

export default router;
