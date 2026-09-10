import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import {
  backfillClaimTrackingCodes,
  claimsTable,
  db,
  donationItemsTable,
  initializeClaimTrackingCodes,
  recipientAccountsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

const rollback = Symbol("rollback");

function isImmutableTrackingCodeError(error: unknown): boolean {
  let current: unknown = error;
  while (current && typeof current === "object") {
    const candidate = current as {
      code?: unknown;
      constraint?: unknown;
      cause?: unknown;
    };
    if (
      candidate.code === "23514"
      && candidate.constraint === "claims_tracking_code_immutable"
    ) {
      return true;
    }
    current = candidate.cause;
  }
  return false;
}

test("historical claim codes remain unchanged during repair", async (t) => {
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
      assert.equal(assigned.some((entry) => entry.id === id), false);

      const [claim] = await tx
        .select({ trackingCode: claimsTable.trackingCode })
        .from(claimsTable)
        .where(eq(claimsTable.id, id));
      assert.equal(claim?.trackingCode, "DS-LEGACY123456");

      throw rollback;
    });
    assert.fail("test transaction should roll back");
  } catch (error) {
    assert.equal(error, rollback);
  }
});

test("missing claim codes are assigned once and remain stable", async (t) => {
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
        trackingCode: null,
        accountId: account.id,
        itemId: item.id,
        status: "cancelled",
        submittedBy: "tracking-code-regression-test",
      });

      const firstRepair = await backfillClaimTrackingCodes(tx);
      const assigned = firstRepair.find((entry) => entry.id === id);
      assert.match(assigned?.trackingCode ?? "", /^DSC-\d{6}$/);

      const secondRepair = await backfillClaimTrackingCodes(tx);
      assert.equal(secondRepair.some((entry) => entry.id === id), false);

      const [claim] = await tx
        .select({ trackingCode: claimsTable.trackingCode })
        .from(claimsTable)
        .where(eq(claimsTable.id, id));
      assert.equal(claim?.trackingCode, assigned?.trackingCode);

      throw rollback;
    });
    assert.fail("test transaction should roll back");
  } catch (error) {
    assert.equal(error, rollback);
  }
});

test("assigned claim tracking codes cannot be cleared or replaced", async (t) => {
  const [[account], [item]] = await Promise.all([
    db.select({ id: recipientAccountsTable.id }).from(recipientAccountsTable).limit(1),
    db.select({ id: donationItemsTable.id }).from(donationItemsTable).limit(1),
  ]);

  if (!account || !item) {
    t.skip("requires seeded account and item records");
    return;
  }

  await initializeClaimTrackingCodes();

  const id = randomUUID();
  const originalTrackingCode = `DS-HISTORICAL-${id}`;
  await db.insert(claimsTable).values({
    id,
    trackingCode: originalTrackingCode,
    accountId: account.id,
    itemId: item.id,
    status: "cancelled",
    submittedBy: "tracking-code-regression-test",
  });

  try {
    await assert.rejects(
      db
        .update(claimsTable)
        .set({ trackingCode: null })
        .where(eq(claimsTable.id, id)),
      isImmutableTrackingCodeError,
    );
    await assert.rejects(
      db
        .update(claimsTable)
        .set({ trackingCode: `${originalTrackingCode}-REPLACED` })
        .where(eq(claimsTable.id, id)),
      isImmutableTrackingCodeError,
    );

    const [claim] = await db
      .select({ trackingCode: claimsTable.trackingCode })
      .from(claimsTable)
      .where(eq(claimsTable.id, id));
    assert.equal(claim?.trackingCode, originalTrackingCode);
  } finally {
    await db.delete(claimsTable).where(eq(claimsTable.id, id));
  }
});

test("concurrent initialization preserves a single working invariant", async () => {
  await Promise.all([
    initializeClaimTrackingCodes(),
    initializeClaimTrackingCodes(),
  ]);
});