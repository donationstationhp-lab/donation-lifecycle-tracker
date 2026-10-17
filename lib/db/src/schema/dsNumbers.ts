import { check, customType, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/** Decimal strings at JS/JSON boundaries; never round a PostgreSQL bigint. */
export const bigintString = customType<{ data: string; driverData: string }>({
  dataType: () => "bigint",
  toDriver: value => BigInt(value).toString(),
  fromDriver: value => String(value),
});

/** Retain the existing small-number counter API for claims, safely widen DS. */
export const bigintCounter = customType<{ data: number | string; driverData: string }>({
  dataType: () => "bigint",
  toDriver: value => {
    if (typeof value === "number" && !Number.isSafeInteger(value)) throw new Error("Unsafe counter number");
    return BigInt(value).toString();
  },
  fromDriver: value => {
    const n = BigInt(value);
    return n <= BigInt(Number.MAX_SAFE_INTEGER) && n >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(n) : n.toString();
  },
});

// Permanent reservations survive deletion and relabeling. A null identity is an
// alias-only/ambiguous reservation, not permission to issue the number again.
// Deliberately no cascading FK: deleting an item cannot release its old labels.
export const itemDsReservationsTable = pgTable("item_ds_reservations", {
  dsNumber: bigintString("ds_number").primaryKey(),
  identityId: text("identity_id"),
  reservedAt: timestamp("reserved_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [check("item_ds_reservation_positive", sql`${t.dsNumber} > 0`)]);
