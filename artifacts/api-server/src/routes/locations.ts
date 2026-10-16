import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, locationsTable } from "@workspace/db";
import { isUniqueViolation } from "../lib/dbErrors";
import { requireAgent } from "../lib/network";
import { NetworkError } from "../lib/networkRules";

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
  const { code, zone, capacity, description, temp_zone, tempZone, agentId } = req.body ?? {};

  if (!code || !zone) {
    res.status(400).json({ error: "code and zone are required" });
    return;
  }

  const id = randomUUID();
  try {
    if (typeof agentId !== "string" || !agentId) {
      res.status(400).json({ error: "Choose the agent this shelf belongs to." }); return;
    }
    const location = await db.transaction(async tx => {
      await requireAgent(tx, agentId);
      const [created] = await tx
      .insert(locationsTable)
      .values({
        id,
        agentId,
        code: String(code),
        zone: String(zone),
        capacity: capacity != null ? Number(capacity) : null,
        description: description ? String(description) : null,
        tempZone: String(temp_zone ?? tempZone ?? "ambient"),
      })
      .returning();
      return created;
    });
    res.status(201).json(location);
  } catch (err) {
    if (err instanceof NetworkError) { res.status(err.status).json({ error: err.message }); return; }
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: `Location code '${code}' already exists` });
    } else {
      throw err;
    }
  }
});

export default router;
