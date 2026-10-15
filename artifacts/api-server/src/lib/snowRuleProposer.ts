import { eq } from "drizzle-orm";
import { itemIdentitiesTable, itemSnowTable } from "@workspace/db";
import type { IdentityTransaction } from "./itemIdentity";
import { recordSnowProposal } from "./itemSnow";
import { foodFacts, proposeSnowRulesV1, SNOW_RULES_VERSION, type RuleInput } from "./snowRulesV1";

export async function applySnowRules(tx: IdentityTransaction, itemId: string, input: RuleInput) {
  await tx.select({ id: itemIdentitiesTable.id }).from(itemIdentitiesTable)
    .where(eq(itemIdentitiesTable.id, itemId)).for("update");
  const [current] = await tx.select().from(itemSnowTable).where(eq(itemSnowTable.itemId, itemId));
  const proposal = proposeSnowRulesV1(foodFacts(input));
  // Don't erase a proposal owned by another proposer when these rules abstain.
  if (!proposal) {
    if (current?.proposalSource === SNOW_RULES_VERSION) {
      await tx.update(itemSnowTable).set({
        version: current.version + 1, proposalId: null, proposedTier: null,
        proposalSource: null, proposedAt: null, proposalRationale: null,
      }).where(eq(itemSnowTable.itemId, itemId));
    }
    return null;
  }
  if (current?.proposalSource === SNOW_RULES_VERSION && current.proposedTier === proposal.tier
    && current.proposalRationale === proposal.rationale) return proposal;
  await recordSnowProposal(tx, itemId, {
    tier: proposal.tier, source: SNOW_RULES_VERSION, rationale: proposal.rationale,
  });
  return proposal;
}
