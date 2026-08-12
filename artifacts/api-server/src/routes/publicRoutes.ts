/**
 * Public (unauthenticated) routes — no X-API-Key required.
 * Mounted BEFORE the apiKeyAuth middleware in routes/index.ts.
 */
import { Router, type IRouter } from "express";
import { randomUUID } from "crypto";
import { db, donationItemsTable, stageHistoryTable } from "@workspace/db";

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
    sum = String(sum)
      .split("")
      .reduce((acc, d) => acc + parseInt(d, 10), 0);
  }
  return String(sum);
}

/**
 * POST /public/donate
 *
 * Body (all optional except `name`):
 *   donorName, name, category, condition, quantity,
 *   perishable, expiryDate, temperatureZone, weight,
 *   origin, notes
 *
 * Creates an item at stage=intake with pendingReview=true so staff
 * can verify before it enters the normal workflow.
 */
router.post("/public/donate", async (req, res): Promise<void> => {
  const {
    donorName,
    name,
    category,
    condition,
    quantity,
    perishable,
    expiryDate,
    temperatureZone,
    weight,
    origin,
    notes,
  } = req.body ?? {};

  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "Item name is required." });
    return;
  }

  const now = new Date();
  const id = randomUUID();
  const itemId = generateItemId();
  const lotNumber = generateLotNumber();

  // Build a donor string — default to "Community Donor" when anonymous
  const donorStr = donorName?.trim() ? String(donorName).trim() : "Community Donor";

  // Append quantity to name if > 1
  const qty = parseInt(String(quantity ?? 1), 10) || 1;
  const itemName = qty > 1 ? `${name.trim()} (×${qty})` : name.trim();

  const [item] = await db
    .insert(donationItemsTable)
    .values({
      id,
      itemId,
      name: itemName,
      category: category ? String(category).trim() : "General",
      tier: "R", // Default tier — staff will classify during review
      condition: condition ? String(condition) : "good",
      donor: donorStr,
      expiryDate: perishable && expiryDate ? String(expiryDate) : null,
      temperatureZone: perishable ? (temperatureZone ?? "ambient") : "ambient",
      weight: perishable && weight ? Number(weight) : null,
      origin: origin ? String(origin).trim() : null,
      lotNumber,
      powerConnectionReading: computeNumerology(now),
      stage: "intake",
      pendingReview: true,
    })
    .returning();

  const historyNotes = [
    "Submitted via public donor form",
    notes ? `Donor notes: ${String(notes).trim()}` : null,
    perishable ? "Perishable item" : null,
  ]
    .filter(Boolean)
    .join(" | ");

  await db.insert(stageHistoryTable).values({
    id: randomUUID(),
    itemId: id,
    fromStage: null,
    toStage: "intake",
    notes: historyNotes,
  });

  res.status(201).json({
    itemId: item.itemId,
    lotNumber: item.lotNumber,
    message: "Thank you! Your donation has been submitted for review.",
  });
});

export default router;
