export const claimStatuses = ["submitted", "verified", "approved", "fulfilled", "rejected", "cancelled"] as const;
export type ClaimStatus = (typeof claimStatuses)[number];
export const transferStatuses = ["planned", "released", "received", "cancelled"] as const;
export type TransferStatus = (typeof transferStatuses)[number];

const claimTransitions: Record<ClaimStatus, readonly ClaimStatus[]> = {
  submitted: ["verified", "rejected", "cancelled"],
  verified: ["approved", "rejected", "cancelled"],
  // Fulfilment is an effect of a received transfer, never a direct claim action.
  approved: ["cancelled"],
  fulfilled: [],
  rejected: [],
  cancelled: [],
};
const transferTransitions: Record<TransferStatus, readonly TransferStatus[]> = {
  planned: ["released", "cancelled"],
  released: ["received", "cancelled"],
  received: [],
  cancelled: [],
};

export type TransitionResult = { ok: true; idempotent: boolean } | { ok: false; reason: string };

function transition(
  current: string,
  target: string,
  graph: Record<string, readonly string[]>,
): TransitionResult {
  if (current === target) return { ok: true, idempotent: true };
  if (!graph[current]?.includes(target)) return { ok: false, reason: `Cannot transition from ${current} to ${target}` };
  return { ok: true, idempotent: false };
}

export function validateClaimTransition(current: ClaimStatus, target: ClaimStatus, evidence: readonly { kind: string; reference: string; note: string }[] = []): TransitionResult {
  const result = transition(current, target, claimTransitions);
  if (!result.ok || result.idempotent || target !== "verified") return result;
  const required = ["identity", "eligibility", "need"];
  const complete = new Set(
    evidence
      .filter((record) => record.reference.trim().length > 0 && record.note.trim().length > 0)
      .map((record) => record.kind),
  );
  const missing = required.filter((kind) => !complete.has(kind));
  return missing.length ? { ok: false, reason: `Verification requires ${missing.join(", ")} evidence` } : result;
}

export function validateTransferTransition(current: TransferStatus, target: TransferStatus): TransitionResult {
  return transition(current, target, transferTransitions);
}

export function canCollectEvidence(status: ClaimStatus): TransitionResult {
  return status === "submitted"
    ? { ok: true, idempotent: false }
    : { ok: false, reason: "Evidence can only be added to a submitted claim" };
}