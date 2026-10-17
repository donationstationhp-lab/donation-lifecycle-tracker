import { eq, sql } from "drizzle-orm";
import { db, trackingCountersTable } from "@workspace/db";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export const ITEM_DS_COUNTER_NAME = "item_ds";

export function formatItemDsId(number: bigint | string | number): string {
  if (typeof number === "number" && !Number.isSafeInteger(number)) throw new Error("Unsafe DS number");
  const n = BigInt(number);
  if (n < 1n) throw new Error("DS numbers must be positive");
  return `DS-${n.toString().padStart(4, "0")}`;
}

/** All creators/importers serialize on this row; bigint arithmetic stays exact. */
export async function lockItemDsCounter(tx: Transaction): Promise<bigint> {
  await tx.insert(trackingCountersTable).values({
    name: ITEM_DS_COUNTER_NAME, nextNumber: "6",
  }).onConflictDoNothing();
  const [counter] = await tx.select().from(trackingCountersTable)
    .where(eq(trackingCountersTable.name, ITEM_DS_COUNTER_NAME)).for("update");
  if (!counter) throw new Error("DS item counter is unavailable");
  return BigInt(counter.nextNumber);
}

/** Aliases reserve numbers, but never raise the canonical pilot high-water mark. */
export async function highestCanonicalDsNumber(tx: Transaction): Promise<bigint> {
  const result = await tx.execute<{ highest: string }>(sql`
    SELECT COALESCE(MAX(substring(label FROM 4)::bigint),0)::text AS highest
    FROM (
      SELECT item_id AS label FROM donation_items
      UNION ALL SELECT display_id FROM item_identities
    ) canonical WHERE label ~ '^DS-[0-9]+$'
  `);
  return BigInt(result.rows[0]?.highest ?? "0");
}

export async function nextUnreservedDsNumber(tx: Transaction, start: bigint): Promise<bigint> {
  let next = start;
  for (;;) {
    const blocked = await tx.execute<{ present: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1 FROM item_ds_reservations WHERE ds_number=${next.toString()}::bigint
        UNION ALL SELECT 1 FROM item_identity_aliases
          WHERE alias ~ '^DS-[0-9]+$' AND substring(alias FROM 4)::numeric=${next.toString()}::numeric
        UNION ALL SELECT 1 FROM notion_item_snapshots
          WHERE source_item_id ~ '^DS-[0-9]+$' AND substring(source_item_id FROM 4)::numeric=${next.toString()}::numeric
      ) AS present
    `);
    if (!blocked.rows[0]?.present) return next;
    next += 1n;
  }
}

export async function reconcileItemDsCounter(tx: Transaction): Promise<bigint> {
  const previous = await lockItemDsCounter(tx);
  const floor = await highestCanonicalDsNumber(tx) + 1n;
  const next = await nextUnreservedDsNumber(tx, previous > floor ? previous : floor);
  await tx.update(trackingCountersTable).set({ nextNumber: next.toString() })
    .where(eq(trackingCountersTable.name, ITEM_DS_COUNTER_NAME));
  return next;
}

export async function allocateItemDsId(tx: Transaction): Promise<string> {
  const next = await reconcileItemDsCounter(tx);
  await tx.update(trackingCountersTable).set({ nextNumber: (next + 1n).toString() })
    .where(eq(trackingCountersTable.name, ITEM_DS_COUNTER_NAME));
  return formatItemDsId(next);
}
