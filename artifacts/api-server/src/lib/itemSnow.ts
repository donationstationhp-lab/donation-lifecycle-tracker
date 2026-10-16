import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, itemIdentitiesTable, itemSnowTable, itemSnowHistoryTable, itemSnowProposalHistoryTable, type ItemSnow } from "@workspace/db";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function snowProposal(row: ItemSnow | undefined) {
  if (!row?.proposalId || !row.proposedTier || !row.proposalSource || !row.proposedAt) return null;
  return {
    id: row.proposalId, tier: row.proposedTier, source: row.proposalSource,
    proposedAt: row.proposedAt.toISOString(), rationale: row.proposalRationale,
  };
}

// Call with the item row locked, so state and history describe the same version.
export async function readItemSnow(tx: Transaction, itemId: string) {
  const [row] = await tx.select().from(itemSnowTable).where(eq(itemSnowTable.itemId, itemId));
  const history = await tx.select().from(itemSnowHistoryTable)
    .where(eq(itemSnowHistoryTable.itemId, itemId)).orderBy(desc(itemSnowHistoryTable.version));
  const proposalHistory = await tx.select().from(itemSnowProposalHistoryTable)
    .where(eq(itemSnowProposalHistoryTable.itemId, itemId)).orderBy(desc(itemSnowProposalHistoryTable.proposedAt));
  return {
    version: row?.version ?? 0,
    proposal: snowProposal(row),
    accepted: row?.acceptedTier ? {
      tier: row.acceptedTier, by: row.acceptedBy!, at: row.acceptedAt!.toISOString(),
      decision: row.acceptedDecision!, source: row.acceptedSource ?? "Staff review",
    } : null,
    awaitingReview: !!row?.proposedTier && !row?.acceptedTier,
    history,
    proposalHistory,
  };
}

const proposalInput = z.object({
  tier: z.enum(["URGENT", "STABLE", "SURPLUS"]),
  source: z.string().trim().min(1).max(120),
  rationale: z.string().trim().max(500).nullable().optional(),
}).strict();

/**
 * Proposal-only boundary used by deterministic proposers.
 * Acceptance and its audit are never touched by this function.
 */
export async function recordSnowProposal(
  tx: Transaction, itemId: string, input: z.input<typeof proposalInput>,
) {
  const data = proposalInput.parse(input);
  const [item] = await tx.select({ id: itemIdentitiesTable.id }).from(itemIdentitiesTable)
    .where(eq(itemIdentitiesTable.id, itemId)).for("update");
  if (!item) throw new Error("Item not found");
  await tx.insert(itemSnowTable).values({ itemId }).onConflictDoNothing();
  const [current] = await tx.select().from(itemSnowTable).where(eq(itemSnowTable.itemId, itemId));
  if (current.proposalId && current.proposedTier && current.proposalSource && current.proposedAt) {
    await tx.insert(itemSnowProposalHistoryTable).values({
      id: current.proposalId, itemId, tier: current.proposedTier, source: current.proposalSource,
      proposedAt: current.proposedAt, rationale: current.proposalRationale,
    }).onConflictDoNothing();
  }
  const proposalId = randomUUID();
  const proposedAt = new Date();
  await tx.update(itemSnowTable).set({
    version: current.version + 1, proposalId,
    proposedTier: data.tier, proposalSource: data.source,
    proposedAt, proposalRationale: data.rationale ?? null,
  }).where(eq(itemSnowTable.itemId, itemId));
  await tx.insert(itemSnowProposalHistoryTable).values({
    id: proposalId, itemId, tier: data.tier, source: data.source,
    proposedAt, rationale: data.rationale ?? null,
  });
}
