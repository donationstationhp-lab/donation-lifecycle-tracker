import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, donationItemsTable, itemIdCountersTable } from "@workspace/db";

// Shared DS-#### item id allocator for every intake path (staff form,
// pickup completion, approved public donations). Replaces the three
// independent `DS-${random 4 digits}` generators that used to live in
// items.ts / pickups.ts / publicRoutes.ts, which had no uniqueness
// guarantee and could collide.
const ITEM_DS_COUNTER = "item_ds";
// Highest real pilot-era DS-#### number already in use; the first id this
// allocator ever hands out is DS-0006.
const ITEM_DS_SEED = 5;
const MAX_ALLOCATION_ATTEMPTS = 1000;

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function formatDsId(num: number): string {
  return `DS-${String(num).padStart(4, "0")}`;
}

async function incrementDsCounter(tx: Transaction): Promise<number> {
  const [row] = await tx
    .insert(itemIdCountersTable)
    .values({ name: ITEM_DS_COUNTER, value: ITEM_DS_SEED + 1 })
    .onConflictDoUpdate({
      target: itemIdCountersTable.name,
      set: { value: sql`${itemIdCountersTable.value} + 1` },
    })
    .returning({ value: itemIdCountersTable.value });
  return row.value;
}

/**
 * Atomically allocates the next DS-#### item id. Must be called inside the
 * same transaction as the item insert it backs, so a rolled-back insert
 * doesn't leave a hole and two concurrent intakes never see the same number.
 * Skips any number a pre-existing (e.g. legacy random-ID) item already holds.
 */
export async function allocateItemDsId(tx: Transaction): Promise<string> {
  for (let attempt = 0; attempt < MAX_ALLOCATION_ATTEMPTS; attempt++) {
    const itemId = formatDsId(await incrementDsCounter(tx));
    const [existing] = await tx
      .select({ id: donationItemsTable.id })
      .from(donationItemsTable)
      .where(eq(donationItemsTable.itemId, itemId));
    if (!existing) return itemId;
  }
  throw new Error("Could not allocate a unique DS-#### item id");
}

/**
 * Provisional id for an unreviewed public /donate submission. Never touches
 * the DS- counter, so a rejected/deleted submission doesn't burn a number —
 * the real DS-#### id is assigned by allocateItemDsId when staff approves it.
 */
export function generateProvisionalItemId(): string {
  return `P-${randomUUID().slice(0, 8).toUpperCase()}`;
}
