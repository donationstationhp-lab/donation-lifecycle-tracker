import { pgTable, text, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Generic named counters for atomically allocating sequential identifiers
// (e.g. the "item_ds" row backs DS-#### item ids). A row is created lazily
// on first use via upsert, so no seed migration is required per counter.
//
// Named `item_id_counters` (not `tracking_counters`) because the live
// Replit app already uses `tracking_counters` for a different counter
// (DSC-###### claim tracking codes, `next_number` column, no default) —
// see trackingCounters.ts. Same name, incompatible shape; this table keeps
// the GitHub-side item-id allocator working under its own name instead of
// colliding with that one.
export const itemIdCountersTable = pgTable("item_id_counters", {
  name: text("name").primaryKey(),
  value: integer("value").notNull().default(0),
});

export const insertItemIdCounterSchema = createInsertSchema(itemIdCountersTable);
export type InsertItemIdCounter = z.infer<typeof insertItemIdCounterSchema>;
export type ItemIdCounter = typeof itemIdCountersTable.$inferSelect;
