// Versioned, deterministic rules. No model calls, supply/demand inference,
// accepted-tier writes, or expiry-date edits belong in this module.
export const SNOW_RULES_VERSION = "rules-v1" as const;
export const SNOW_RULES = {
  homemade: "food-homemade",
  unlabeled: "food-unlabeled",
  undated: "food-undated",
  sealedDated: "food-sealed-and-dated",
} as const;

export type FoodFacts = {
  food: boolean; homemade: boolean | null; labeled: boolean | null;
  sealed: boolean | null; dated: boolean | null; receivedDate: string | null;
};
export type RuleInput = {
  name: string; category: string; notes?: string | null;
  expiryDate?: string | null; receivedDate?: string | null;
};

/**
 * Only explicit evidence counts. An empty expiry field is NOT proof that the
 * physical food is undated. Receipt dates are never treated as package dates.
 * Cross-item comparisons and quoted policy commentary are not item facts.
 */
export function foodFacts(input: RuleInput): FoodFacts {
  const itemNotes = (input.notes ?? "").split(/\b(?:CONTRAST WITH|DECISION\s+\d|PILOT FINDING|RULE EXAMPLE)\b/i)[0];
  const text = `${input.name}. ${itemNotes}`.toLowerCase();
  const homemade = /\b(?:not|isn't|is not|non)[ -]homemade\b/.test(text) ? false
    : /\bhomemade\b/.test(text) ? true : null;
  const explicitlyUnlabeled = /\b(?:unlabeled|unlabelled|no label|without (?:a )?label)\b/.test(text);
  const explicitlyUndated = /\b(?:undated|no date|without (?:a )?date)\b/.test(text);
  const sealed = /\b(?:unsealed|not sealed|isn't sealed|open(?:ed)? package)\b/.test(text) ? false
    : /\bsealed\b/.test(text) ? true : null;
  return {
    food: /^(?:food|foods|groceries|prepared food|food\s*[&/—-])/i.test(input.category.trim()),
    homemade,
    labeled: explicitlyUnlabeled ? false : /\b(?:labeled|labelled)\b/.test(text) ? true : null,
    sealed,
    dated: explicitlyUndated ? false : input.expiryDate ? true : /\bdated\b/.test(text) ? true : null,
    receivedDate: input.receivedDate ?? null,
  };
}

export function proposeSnowRulesV1(facts: FoodFacts) {
  if (!facts.food) return null;
  if (facts.homemade === true) {
    let ceiling = "receipt date not recorded";
    if (facts.receivedDate && /^\d{4}-\d{2}-\d{2}$/.test(facts.receivedDate)) {
      const date = new Date(`${facts.receivedDate}T00:00:00Z`);
      if (Number.isFinite(date.getTime())) {
        date.setUTCDate(date.getUTCDate() + 3); ceiling = date.toISOString().slice(0, 10);
      }
    }
    return {
      tier: "URGENT" as const, rule: SNOW_RULES.homemade,
      rationale: `food-homemade: same-day distribution; homemade food has a 3-day ceiling from receipt (${ceiling}).`,
    };
  }
  if (facts.labeled === false || facts.dated === false) {
    const rule = facts.labeled === false ? SNOW_RULES.unlabeled : SNOW_RULES.undated;
    return {
      tier: "URGENT" as const, rule,
      rationale: `${rule}: same-day distribution; if homemade, the ceiling is 3 days from receipt.`,
    };
  }
  if (facts.sealed === true && facts.dated === true) {
    return {
      tier: "STABLE" as const, rule: SNOW_RULES.sealedDated,
      rationale: "food-sealed-and-dated: explicitly sealed food with a recorded package date.",
    };
  }
  return null;
}
