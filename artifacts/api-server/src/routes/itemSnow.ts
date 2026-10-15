import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, itemIdentitiesTable, itemSnowTable, itemSnowHistoryTable } from "@workspace/db";
import { ReviewItemSnowBody } from "@workspace/api-zod";
import { requireStaff } from "../middlewares/apiKeyAuth";
import { readItemSnow, snowProposal } from "../lib/itemSnow";

const router: IRouter = Router();
router.use("/items/:id/snow", requireStaff);

router.get("/items/:id/snow", async (req, res): Promise<void> => {
  const id = String(req.params.id);
  const state = await db.transaction(async (tx) => {
    const [item] = await tx.select({ id: itemIdentitiesTable.id }).from(itemIdentitiesTable)
      .where(eq(itemIdentitiesTable.id, id)).for("share");
    return item ? readItemSnow(tx, id) : null;
  });
  if (!state) { res.status(404).json({ error: "Item not found" }); return; }
  res.json(state);
});

router.post("/items/:id/snow", async (req, res): Promise<void> => {
  // API keys can run unattended. Only a named human staff session may accept.
  if (res.locals.authMethod !== "clerk" || !res.locals.staffUserId) {
    res.status(403).json({ error: "Sign in as a staff member to accept a S.N.O.W. tier" });
    return;
  }
  const parsed = ReviewItemSnowBody.strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const body = parsed.data;
  if (body.action === "override" && (!body.tier || !body.reason?.trim())) {
    res.status(400).json({ error: "Choose an accepted tier and provide a short reason" });
    return;
  }
  const id = String(req.params.id);
  const result = await db.transaction(async (tx) => {
    const [item] = await tx.select({ id: itemIdentitiesTable.id }).from(itemIdentitiesTable)
      .where(eq(itemIdentitiesTable.id, id)).for("update");
    if (!item) return { status: 404, error: "Item not found" } as const;
    await tx.insert(itemSnowTable).values({ itemId: id }).onConflictDoNothing();
    const [current] = await tx.select().from(itemSnowTable).where(eq(itemSnowTable.itemId, id));
    if (current.version !== body.expectedVersion) {
      return { status: 409, error: "S.N.O.W. review changed. Refresh before deciding." } as const;
    }
    const proposal = snowProposal(current);
    if (body.action === "confirm" && !proposal) {
      return { status: 409, error: "There is no proposal to confirm" } as const;
    }
    const tier = body.action === "confirm" ? proposal!.tier : body.tier!;
    if (proposal && body.action === "override" && tier === proposal.tier) {
      return { status: 400, error: "Use Confirm when accepting the proposed tier" } as const;
    }
    const decision = body.action === "confirm" ? "confirmed" : proposal ? "overridden" : "manual";
    const now = new Date();
    const version = current.version + 1;
    await tx.update(itemSnowTable).set({
      version, acceptedTier: tier, acceptedBy: res.locals.staffUserId,
      acceptedAt: now, acceptedDecision: decision, acceptedSource: "Staff review",
    }).where(eq(itemSnowTable.itemId, id));
    await tx.insert(itemSnowHistoryTable).values({
      id: randomUUID(), itemId: id, version, previousTier: current.acceptedTier,
      acceptedTier: tier, acceptedBy: res.locals.staffUserId, acceptedAt: now,
      decision, reason: body.reason?.trim() ?? null, proposal,
    });
    return { status: 200, state: await readItemSnow(tx, id) } as const;
  });
  if ("error" in result) { res.status(result.status).json({ error: result.error }); return; }
  res.json(result.state);
});

export default router;
