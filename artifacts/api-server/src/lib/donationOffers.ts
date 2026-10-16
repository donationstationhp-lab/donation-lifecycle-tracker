import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  db, donationSubmissionsTable, stageHistoryTable, type DonationOfferDetails,
} from "@workspace/db";
import { itemRepository } from "./itemRepository";
import { allocateItemDsId } from "./itemIds";
import { recordAcknowledgment, recordServiceActivity } from "./serviceActivities";
import { recordAgentReceipt } from "./network";

export class DonationOfferError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function validOfferDate(value: string | null | undefined): boolean {
  if (value == null) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function reviewDonationOffer(id: string, decision: "approved" | "declined", actor: string) {
  return db.transaction(async (tx) => {
    const [offer] = await tx.select().from(donationSubmissionsTable)
      .where(eq(donationSubmissionsTable.id, id)).for("update");
    if (!offer) throw new DonationOfferError(404, "Donation offer not found.");
    // Repeated same decision returns the original actor/timestamp, not a rewrite.
    if (offer.status === decision) return offer;
    if (offer.status !== "submitted") {
      throw new DonationOfferError(409, "Only submitted offers may be approved or declined.");
    }
    const [updated] = await tx.update(donationSubmissionsTable).set({
      status: decision, reviewedBy: actor, reviewedAt: new Date(),
    }).where(eq(donationSubmissionsTable.id, id)).returning();
    return updated;
  });
}

function powerConnectionReading(date: Date): string {
  let sum = date.toISOString().slice(0, 10).replaceAll("-", "")
    .split("").reduce((total, digit) => total + Number(digit), 0);
  while (sum > 9 && ![11, 22, 33].includes(sum)) {
    sum = String(sum).split("").reduce((total, digit) => total + Number(digit), 0);
  }
  return String(sum);
}

export async function receiveDonationOffer(id: string, details: DonationOfferDetails, actor: string, receivingAgentId: string) {
  return db.transaction(async (tx) => {
    const [offer] = await tx.select().from(donationSubmissionsTable)
      .where(eq(donationSubmissionsTable.id, id)).for("update");
    if (!offer) throw new DonationOfferError(404, "Donation offer not found.");
    const repository = itemRepository.forTransaction(tx);
    if (offer.receivedItemId) {
      const item = await repository.getById(offer.receivedItemId);
      if (!item) throw new DonationOfferError(409, "Linked receipt requires staff investigation.");
      return item;
    }
    if (offer.status !== "approved") {
      throw new DonationOfferError(409, "Only approved offers may be physically received.");
    }
    const now = new Date();
    await recordAgentReceipt(tx, receivingAgentId, actor, now);
    // Lock order: submission, then existing central allocator. No new mint.
    const displayId = await allocateItemDsId(tx);
    const itemId = randomUUID();
    const quantity = details.quantity ?? 1;
    const item = await repository.insert({
      id: itemId, itemId: displayId, receivingAgentId,
      name: quantity > 1 ? `${details.name.trim()} (×${quantity})` : details.name.trim(),
      category: details.category?.trim() || "General", tier: "R",
      condition: details.condition ?? "good",
      donor: details.donorName?.trim() || "Community Donor",
      expiryDate: details.perishable ? details.expiryDate ?? null : null,
      temperatureZone: details.perishable ? details.temperatureZone ?? "ambient" : "ambient",
      weight: details.weight ?? null, origin: details.origin?.trim() || null,
      lotNumber: `LOT-${Math.floor(1000 + Math.random() * 9000)}`,
      powerConnectionReading: powerConnectionReading(now),
      stage: "intake", pendingReview: false,
    });
    await tx.insert(stageHistoryTable).values({
      id: randomUUID(), itemId, fromStage: null, toStage: "intake",
      notes: `Physical receipt confirmed from ${offer.reference} by ${actor}`,
    });
    const activityId = await recordServiceActivity(tx, {
      activityType: "donation_intake", loopStage: "received",
      relatedItemId: itemId, status: "received", staffOwner: actor, completedAt: now,
      publicSafeSummary: "Donation received",
      internalNotes: `Physical receipt from ${offer.reference}${details.notes ? ` | ${details.notes}` : ""}`,
      idempotencyKey: `item:${itemId}:received`,
    });
    await recordAcknowledgment(tx, { parentActivityId: activityId, relatedItemId: itemId, staffOwner: actor });
    await tx.update(donationSubmissionsTable).set({
      status: "received", receivedDetails: details, receivedItemId: itemId,
      receivedBy: actor, receivedAt: now,
    }).where(eq(donationSubmissionsTable.id, id));
    return item;
  });
}
