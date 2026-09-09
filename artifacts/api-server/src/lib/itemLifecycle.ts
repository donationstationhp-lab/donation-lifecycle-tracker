export const ITEM_STAGE_FLOW = [
  "intake",
  "qc",
  "storage",
  "matched",
  "scheduled",
  "distributed",
  "closed",
] as const;

export type ItemStage = (typeof ITEM_STAGE_FLOW)[number];

const MANUAL_NORMAL_TRANSITIONS: Partial<Record<ItemStage, ItemStage>> = {
  intake: "qc",
  qc: "storage",
  distributed: "closed",
};

const PUBLIC_STAGE_LABELS: Record<ItemStage, string> = {
  intake: "Received",
  qc: "Quality Check",
  storage: "Ready for Matching",
  matched: "Matched / Claimed",
  scheduled: "Distribution Scheduled",
  distributed: "Distributed",
  closed: "Completed",
};

export function isItemStage(value: string): value is ItemStage {
  return ITEM_STAGE_FLOW.includes(value as ItemStage);
}

export function nextItemStage(stage: ItemStage): ItemStage | null {
  const index = ITEM_STAGE_FLOW.indexOf(stage);
  return index >= 0 && index < ITEM_STAGE_FLOW.length - 1
    ? ITEM_STAGE_FLOW[index + 1]
    : null;
}

export function validateItemStageTransition(
  fromStage: string,
  toStage: string,
  options: { override?: boolean; reason?: string },
): { ok: true; override: boolean } | { ok: false; reason: string } {
  if (!isItemStage(fromStage) || !isItemStage(toStage)) {
    return { ok: false, reason: "Unknown item lifecycle stage" };
  }
  if (fromStage === toStage) {
    return { ok: false, reason: "Item is already in that stage" };
  }
  if (MANUAL_NORMAL_TRANSITIONS[fromStage] === toStage) {
    return { ok: true, override: false };
  }
  if (!options.override) {
    return {
      ok: false,
      reason: MANUAL_NORMAL_TRANSITIONS[fromStage]
        ? `Normal transition must move from ${fromStage} to ${MANUAL_NORMAL_TRANSITIONS[fromStage]}`
        : `${fromStage} is controlled by the claim and transfer lifecycle`,
    };
  }
  if (!options.reason?.trim()) {
    return { ok: false, reason: "A reason is required for a staff override" };
  }
  return { ok: true, override: true };
}

export function publicItemStageLabel(stage: string): string {
  return isItemStage(stage) ? PUBLIC_STAGE_LABELS[stage] : "In Progress";
}