import { eq, sql } from "drizzle-orm";
import { db, trackingCountersTable } from "@workspace/db";
import { ITEM_PAIRING_POLICY } from "./itemPairingPolicy";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const ITEM_DS_COUNTER_NAME = "item_ds";
export const MAX_ITEM_DS_NUMBER = 9_999;
const RESERVED_NUMBER = Math.max(
  0,
  ...ITEM_PAIRING_POLICY.notionFirstLiveItemIds.map((id) => Number(id.slice(3))),
);

export class ItemIdCapacityError extends Error {
  constructor() {
    super("DS item numbers are exhausted. Contact a supervisor before adding more items.");
    this.name = "ItemIdCapacityError";
  }
}

export function formatItemDsId(number: number): string {
  if (!Number.isInteger(number) || number < 1 || number > MAX_ITEM_DS_NUMBER) {
    throw new ItemIdCapacityError();
  }
  return `DS-${number.toString().padStart(4, "0")}`;
}

/**
 * Every item creator/importer must take this lock before writing identities.
 * The row lock is held until the caller's transaction commits or rolls back.
 */
export async function lockItemDsCounter(tx: Transaction): Promise<number> {
  await tx.insert(trackingCountersTable).values({
    name: ITEM_DS_COUNTER_NAME,
    nextNumber: RESERVED_NUMBER + 1,
  }).onConflictDoNothing();
  const [counter] = await tx.select().from(trackingCountersTable)
    .where(eq(trackingCountersTable.name, ITEM_DS_COUNTER_NAME))
    .for("update");
  if (!counter) throw new Error("DS item counter is unavailable");
  return counter.nextNumber;
}

export async function reconcileItemDsCounter(tx: Transaction): Promise<number> {
  const previousNext = await lockItemDsCounter(tx);
  // Read AFTER locking, so READ COMMITTED observes the previous creator's commit.
  // Numeric casting also recognizes historical IDs with different zero padding.
  const result = await tx.execute<{ highest: string }>(sql`
    SELECT COALESCE(MAX(substring(item_id FROM 4)::numeric), 0)::text AS highest
    FROM donation_items
    WHERE item_id ~ '^DS-[0-9]+$'
  `);
  const highest = Number(result.rows[0]?.highest ?? 0);
  // 10000 is an exhaustion sentinel, not a new five-digit display format.
  const nextNumber = Math.max(
    previousNext,
    RESERVED_NUMBER + 1,
    Math.min(highest + 1, MAX_ITEM_DS_NUMBER + 1),
  );
  await tx.update(trackingCountersTable).set({ nextNumber })
    .where(eq(trackingCountersTable.name, ITEM_DS_COUNTER_NAME));
  return nextNumber;
}

export async function allocateItemDsId(tx: Transaction): Promise<string> {
  const nextNumber = await reconcileItemDsCounter(tx);
  const itemId = formatItemDsId(nextNumber);
  await tx.update(trackingCountersTable).set({ nextNumber: nextNumber + 1 })
    .where(eq(trackingCountersTable.name, ITEM_DS_COUNTER_NAME));
  return itemId;
}
