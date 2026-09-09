import { ensureClaimTrackingCodes } from "@workspace/db";

const result = await ensureClaimTrackingCodes();

console.log(
  result.length === 0
    ? "All claims already have tracking codes."
    : `Assigned tracking codes to ${result.length} claim(s).`,
);