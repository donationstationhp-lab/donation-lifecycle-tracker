import { randomUUID } from "node:crypto";
import { db, serviceActivitiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const ACTIVITY_TYPES = [
  "donation_intake", "item_processing", "claim_request", "item_reservation",
  "appointment", "pickup", "dropoff", "distribution", "volunteer_shift",
  "barter_handoff", "acknowledgment",
  "trade_completed",
] as const;

export const LOOP_STAGES = [
  "received", "recognized", "classified", "matched", "scheduled",
  "served", "verified", "acknowledged", "learned",
] as const;

type ActivityTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ActivityInput = Omit<typeof serviceActivitiesTable.$inferInsert, "id" | "idempotencyKey"> & {
  idempotencyKey: string;
};

export async function recordServiceActivity(tx: ActivityTx, input: ActivityInput): Promise<string> {
  const id = randomUUID();
  const [created] = await tx.insert(serviceActivitiesTable).values({
    id,
    ...input,
  }).onConflictDoNothing({ target: serviceActivitiesTable.idempotencyKey })
    .returning({ id: serviceActivitiesTable.id });
  if (created) return created.id;
  const [existing] = await tx.select({ id: serviceActivitiesTable.id })
    .from(serviceActivitiesTable)
    .where(eq(serviceActivitiesTable.idempotencyKey, input.idempotencyKey));
  if (!existing) throw new Error("Service activity idempotency lookup failed");
  return existing.id;
}

export async function recordAcknowledgment(
  tx: ActivityTx,
  source: {
    parentActivityId: string;
    relatedItemId?: string | null;
    relatedClaimId?: string | null;
    relatedAppointmentId?: string | null;
    relatedPickupId?: string | null;
    relatedAccountId?: string | null;
    publicTrackingCode?: string | null;
    staffOwner?: string | null;
  },
): Promise<void> {
  await recordServiceActivity(tx, {
    activityType: "acknowledgment",
    loopStage: "acknowledged",
    status: "pending",
    publicSafeSummary: "Acknowledgment pending",
    internalNotes: "Delivery channel intentionally not connected.",
    idempotencyKey: `acknowledgment:${source.parentActivityId}`,
    ...source,
  });
}