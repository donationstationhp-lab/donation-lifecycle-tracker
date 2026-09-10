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
  trackingCountersTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";

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

test("historical tracking codes stay fixed while repairs continue after the highest DSC code", async (t) => {
  const [[account], [item]] = await Promise.all([
    db.select({ id: recipientAccountsTable.id }).from(recipientAccountsTable).limit(1),
    db.select({ id: donationItemsTable.id }).from(donationItemsTable).limit(1),
  ]);

  if (!account || !item) {
    t.skip("requires seeded account and item records");
    return;
  }

  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`LOCK TABLE tracking_counters, claims IN SHARE ROW EXCLUSIVE MODE`);
      const highestResult = await tx.execute<{ highest: number }>(sql`
        SELECT COALESCE(
          MAX(substring(tracking_code FROM 5)::integer),
          0
        ) AS highest
        FROM claims
        WHERE tracking_code ~ '^DSC-[0-9]{6}$'
      `);
      const highest = Number(highestResult.rows[0]?.highest ?? 0);
      if (highest >= 999_996) {
        t.skip("tracking-code range is too close to exhaustion");
        throw rollback;
      }

      const validId = randomUUID();
      const legacyId = randomUUID();
      const firstMissingId = randomUUID();
      const secondMissingId = randomUUID();
      const validCode = `DSC-${(highest + 1).toString().padStart(6, "0")}`;
      const legacyCode = "DS-LEGACY123456";
      const baseClaim = {
        accountId: account.id,
        itemId: item.id,
        status: "cancelled",
        submittedBy: "tracking-code-regression-test",
      };

      await tx.insert(claimsTable).values([
        {
          ...baseClaim,
          id: validId,
          trackingCode: validCode,
          createdAt: new Date("2020-01-01T00:00:00.000Z"),
        },
        {
          ...baseClaim,
          id: legacyId,
          trackingCode: legacyCode,
          createdAt: new Date("2020-01-02T00:00:00.000Z"),
        },
        {
          ...baseClaim,
          id: firstMissingId,
          trackingCode: null,
          createdAt: new Date("2020-01-03T00:00:00.000Z"),
        },
        {
          ...baseClaim,
          id: secondMissingId,
          trackingCode: null,
          createdAt: new Date("2020-01-04T00:00:00.000Z"),
        },
      ]);
      await tx
        .delete(trackingCountersTable)
        .where(eq(trackingCountersTable.name, "claim"));

      const assigned = await backfillClaimTrackingCodes(tx);
      assert.deepEqual(assigned, [
        {
          id: firstMissingId,
          trackingCode: `DSC-${(highest + 2).toString().padStart(6, "0")}`,
        },
        {
          id: secondMissingId,
          trackingCode: `DSC-${(highest + 3).toString().padStart(6, "0")}`,
        },
      ]);

      const records = await tx.execute<{ id: string; tracking_code: string }>(sql`
        SELECT id, tracking_code
        FROM claims
        WHERE id IN (${validId}, ${legacyId}, ${firstMissingId}, ${secondMissingId})
      `);
      const codesById = new Map(
        records.rows.map((record) => [record.id, record.tracking_code]),
      );
      assert.equal(codesById.get(validId), validCode);
      assert.equal(codesById.get(legacyId), legacyCode);
      assert.equal(codesById.get(firstMissingId), assigned[0]?.trackingCode);
      assert.equal(codesById.get(secondMissingId), assigned[1]?.trackingCode);

      const [counter] = await tx
        .select({ nextNumber: trackingCountersTable.nextNumber })
        .from(trackingCountersTable)
        .where(eq(trackingCountersTable.name, "claim"));
      assert.equal(counter?.nextNumber, highest + 4);

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