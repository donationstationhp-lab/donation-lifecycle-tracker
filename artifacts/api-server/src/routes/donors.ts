import { Router, type IRouter } from "express";
import { eq, ilike, asc } from "drizzle-orm";
import { db, donorsTable, donationItemsTable, type Donor } from "@workspace/db";
import { ListDonorsQueryParams, CreateDonorBody, GetDonorParams } from "@workspace/api-zod";

const router: IRouter = Router();

type DonorStage = "prospect" | "first-gift" | "active" | "lapsing" | "lapsed" | "reactivated";

const LAPSING_DAYS = 60;
const LAPSED_DAYS = 90;
const FIRST_GIFT_DAYS = 30;

function computeStage(giftDates: Date[]): { stage: DonorStage; giftCount: number; lastGiftAt: Date | null } {
  if (giftDates.length === 0) {
    return { stage: "prospect", giftCount: 0, lastGiftAt: null };
  }

  const sorted = [...giftDates].sort((a, b) => a.getTime() - b.getTime());
  const last = sorted[sorted.length - 1];
  const daysSinceLast = (Date.now() - last.getTime()) / 86_400_000;
  const giftCount = sorted.length;

  if (daysSinceLast > LAPSED_DAYS) {
    return { stage: "lapsed", giftCount, lastGiftAt: last };
  }
  if (daysSinceLast > LAPSING_DAYS) {
    return { stage: "lapsing", giftCount, lastGiftAt: last };
  }

  // A gift arrived after a >90 day gap somewhere in this donor's history.
  const hadLapse = sorted.some(
    (date, i) => i > 0 && (date.getTime() - sorted[i - 1].getTime()) / 86_400_000 > LAPSED_DAYS
  );
  if (hadLapse) {
    return { stage: "reactivated", giftCount, lastGiftAt: last };
  }

  if (giftCount === 1 && daysSinceLast <= FIRST_GIFT_DAYS) {
    return { stage: "first-gift", giftCount, lastGiftAt: last };
  }

  return { stage: "active", giftCount, lastGiftAt: last };
}

function toDonorResponse(donor: Donor, giftDates: Date[]) {
  const { stage, giftCount, lastGiftAt } = computeStage(giftDates);
  return {
    id: donor.id,
    name: donor.name,
    contact: donor.contact,
    organization: donor.organization,
    notes: donor.notes,
    stage,
    giftCount,
    lastGiftAt: lastGiftAt ? lastGiftAt.toISOString() : null,
    createdAt: donor.createdAt.toISOString(),
  };
}

// ── GET /donors ──────────────────────────────────────────────────────────────
router.get("/donors", async (req, res): Promise<void> => {
  const parsed = ListDonorsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { stage, search } = parsed.data;

  const donors = search
    ? await db.select().from(donorsTable).where(ilike(donorsTable.name, `%${search}%`))
    : await db.select().from(donorsTable);

  const items = await db
    .select({ donorId: donationItemsTable.donorId, createdAt: donationItemsTable.createdAt })
    .from(donationItemsTable);

  const giftDatesByDonor = new Map<string, Date[]>();
  for (const item of items) {
    if (!item.donorId) continue;
    const list = giftDatesByDonor.get(item.donorId) ?? [];
    list.push(item.createdAt);
    giftDatesByDonor.set(item.donorId, list);
  }

  let results = donors.map((donor) => toDonorResponse(donor, giftDatesByDonor.get(donor.id) ?? []));
  if (stage) {
    results = results.filter((donor) => donor.stage === stage);
  }

  res.json(results);
});

// ── POST /donors ─────────────────────────────────────────────────────────────
router.post("/donors", async (req, res): Promise<void> => {
  const parsed = CreateDonorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { randomUUID } = await import("node:crypto");
  const [donor] = await db
    .insert(donorsTable)
    .values({
      id: randomUUID(),
      name: parsed.data.name,
      contact: parsed.data.contact ?? null,
      organization: parsed.data.organization ?? null,
      notes: parsed.data.notes ?? null,
    })
    .returning();

  res.status(201).json(toDonorResponse(donor, []));
});

// ── GET /donors/:id ───────────────────────────────────────────────────────────
router.get("/donors/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetDonorParams.safeParse({ id: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [donor] = await db.select().from(donorsTable).where(eq(donorsTable.id, params.data.id));
  if (!donor) {
    res.status(404).json({ error: "Donor not found" });
    return;
  }

  const items = await db
    .select()
    .from(donationItemsTable)
    .where(eq(donationItemsTable.donorId, donor.id))
    .orderBy(asc(donationItemsTable.createdAt));

  res.json({
    ...toDonorResponse(donor, items.map((item) => item.createdAt)),
    items,
  });
});

export default router;
