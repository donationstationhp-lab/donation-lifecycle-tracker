import { eq } from "drizzle-orm";
import { itemIdentitiesTable, itemSnowTable } from "@workspace/db";
import type { IdentityTransaction } from "./itemIdentity";
import { recordSnowProposal } from "./itemSnow";
import { foodFacts, proposeSnowRulesV1, SNOW_RULES_VERSION, type RuleInput } from "./snowRulesV1";
import { proposeSnowRulesV2, SNOW_RULES_V2_VERSION, type RuleInputV2 } from "./snowRulesV2";

export async function applySnowRules(tx: IdentityTransaction, itemId: string, input: RuleInput | RuleInputV2, version = SNOW_RULES_VERSION as string) {
  await tx.select({ id: itemIdentitiesTable.id }).from(itemIdentitiesTable)
    .where(eq(itemIdentitiesTable.id, itemId)).for("update");
  const [current] = await tx.select().from(itemSnowTable).where(eq(itemSnowTable.itemId, itemId));
  const proposal = version === SNOW_RULES_V2_VERSION ? proposeSnowRulesV2(input) : proposeSnowRulesV1(foodFacts(input));
  // Don't erase a proposal owned by another proposer when these rules abstain.
  if (!proposal) {
    if (current?.proposalSource === version) {
      await tx.update(itemSnowTable).set({
        version: current.version + 1, proposalId: null, proposedTier: null,
        proposalSource: null, proposedAt: null, proposalRationale: null,
      }).where(eq(itemSnowTable.itemId, itemId));
    }
    return null;
  }
  if (current?.proposalSource === version && current.proposedTier === proposal.tier
    && current.proposalRationale === proposal.rationale) return proposal;
  await recordSnowProposal(tx, itemId, {
    tier: proposal.tier, source: version, rationale: proposal.rationale,
  });
  return proposal;
}
