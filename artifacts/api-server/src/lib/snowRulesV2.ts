import { foodFacts, proposeSnowRulesV1, type RuleInput } from "./snowRulesV1";

export const SNOW_RULES_V2_VERSION = "rules-v2" as const;
export const CATERING_RULE = "food-fresh-prepared-catering-unlabeled-or-undated";

export type RuleInputV2 = RuleInput & { source?: string | null; donor?: string | null };

export function proposeSnowRulesV2(input: RuleInputV2) {
  const facts = foodFacts(input);
  if (!facts.food) return null;
  // Keep cross-item policy examples out of the evidence, just as v1 does.
  const notes = (input.notes ?? "").split(/\b(?:CONTRAST WITH|DECISION\s+\d|PILOT FINDING|RULE EXAMPLE)\b/i)[0];
  const origin = `${input.source ?? ""} ${input.donor ?? ""} ${notes}`;
  const prepared = /\b(?:prepared meals?|salads?|trays?|cooked dishes?|cooked meals?|freshly prepared)\b/i.test(`${input.name} ${notes}`);
  const catering = /\b(?:cater(?:ing|er|ers)?|restaurants?|kitchens?)\b/i.test(origin);
  // Narrow v2 exception: fresh prepared food from a commercial kitchen with
  // no recorded label/date evidence is urgent, not shelf-stable by omission.
  // Explicit sealed+dated evidence still takes the existing STABLE path.
  const noLabelOrDate = facts.labeled === false || facts.dated === false
    || (facts.labeled !== true && facts.dated !== true);
  if (prepared && catering && noLabelOrDate && !(facts.sealed === true && facts.dated === true)) {
    return {
      tier: "URGENT" as const, rule: CATERING_RULE,
      rationale: `${CATERING_RULE}: freshly prepared perishable food from a catering company, restaurant, or kitchen without label/date evidence; same-day distribution only.`,
    };
  }
  return proposeSnowRulesV1(facts);
}
