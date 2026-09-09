import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import {
  backfillClaimTrackingCodes,
  claimsTable,
  db,
  donationItemsTable,
  recipientAccountsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

const rollback = Symbol("rollback");

test("legacy claim codes are replaced with DSC codes transactionally", async (t) => {
  const [[account], [item]] = await Promise.all([
    db.select({ id: recipientAccountsTable.id }).from(recipientAccountsTable).limit(1),
    db.select({ id: donationItemsTable.id }).from(donationItemsTable).limit(1),
  ]);

  if (!account || !item) {
    t.skip("requires seeded account and item records");
    return;
  }

  const id = randomUUID();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(claimsTable).values({
        id,
        trackingCode: "DS-LEGACY123456",
        accountId: account.id,
        itemId: item.id,
        status: "cancelled",
        submittedBy: "tracking-code-regression-test",
      });

      const assigned = await backfillClaimTrackingCodes(tx);
      const repaired = assigned.find((entry) => entry.id === id);
      assert.match(repaired?.trackingCode ?? "", /^DSC-\d{6}$/);

      const [claim] = await tx
        .select({ trackingCode: claimsTable.trackingCode })
        .from(claimsTable)
        .where(eq(claimsTable.id, id));
      assert.equal(claim?.trackingCode, repaired?.trackingCode);

      throw rollback;
    });
    assert.fail("test transaction should roll back");
  } catch (error) {
    assert.equal(error, rollback);
  }
});