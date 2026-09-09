const ACTIVE_ITEM_STAGES = new Set([
  "intake",
  "qc",
  "storage",
  "matched",
  "scheduled",
]);
const DAY_IN_MS = 86_400_000;

export function isActiveItemStage(stage: string): boolean {
  return ACTIVE_ITEM_STAGES.has(stage);
}

export function daysUntilExpiry(expiryDate: string, now: Date): number {
  return Math.ceil(
    (new Date(expiryDate).getTime() - now.getTime()) / DAY_IN_MS,
  );
}

export function isExpiringSoon(
  expiryDate: string | null,
  now: Date,
): boolean {
  if (!expiryDate) return false;
  const diffDays = daysUntilExpiry(expiryDate, now);
  return diffDays >= 0 && diffDays <= 14;
}