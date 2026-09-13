/**
 * Settled policy for the staged Notion item-log pairing.
 *
 * These rules describe the target model only. PostgreSQL remains the active
 * item store until a later migration explicitly enables Notion writes.
 */
export const ITEM_PAIRING_POLICY = Object.freeze({
  snowCategoryTiers: ["URGENT", "STABLE", "SURPLUS"] as const,
  tierValues: [
    "T — Time",
    "I — Intelligence",
    "E — Energy",
    "R — Resources",
  ] as const,
  triRoutingValues: [
    "GIVE",
    "GIVE-UTILITY",
    "NEEDS-LABOR",
    "RECYCLE-ONLY",
  ] as const,
  lifecyclePhases: ["Intake", "Signal", "Grounded"] as const,
  stages: [
    "intake",
    "matched",
    "scheduled",
    "qc",
    "storage",
    "distributed",
    "closed",
  ] as const,
  weightUnits: ["lbs", "kg (unconverted)"] as const,
  canonicalNewWeightField: "weightLbs",
  notionFirstLiveItemIds: [
    "DS-0001",
    "DS-0002",
    "DS-0003",
    "DS-0004",
    "DS-0005",
  ] as const,
  snowTierConfirmation: "staff-confirmed-or-overridden",
  snowTierDerivationIsSuggestionOnly: true,
  lifecyclePhaseAndStageAreSeparateAxes: true,
  preserveHistoricalWeightNumberWithoutConversion: true,
  requireIdentityImportBeforeNotionWrites: true,
  notionWritesEnabled: false,
});
