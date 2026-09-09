import { allocateClaimTrackingCode, claimsTable, db } from "@workspace/db";
import { asc, eq, isNull } from "drizzle-orm";

const result = await db.transaction(async (tx) => {
  const claims = await tx
    .select({ id: claimsTable.id })
    .from(claimsTable)
    .where(isNull(claimsTable.trackingCode))
    .orderBy(asc(claimsTable.createdAt), asc(claimsTable.id))
    .for("update");

  const assigned: Array<{ id: string; trackingCode: string }> = [];
  for (const claim of claims) {
    const trackingCode = await allocateClaimTrackingCode(tx);
    await tx
      .update(claimsTable)
      .set({ trackingCode })
      .where(eq(claimsTable.id, claim.id));
    assigned.push({ id: claim.id, trackingCode });
  }

  return assigned;
});

console.log(
  result.length === 0
    ? "All claims already have tracking codes."
    : `Assigned tracking codes to ${result.length} claim(s).`,
);