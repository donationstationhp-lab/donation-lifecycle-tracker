import { pgTable, text, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Generic named counters for atomically allocating sequential identifiers
// (e.g. the "item_ds" row backs DS-#### item ids). A row is created lazily
// on first use via upsert, so no seed migration is required per counter.
export const trackingCountersTable = pgTable("tracking_counters", {
  name: text("name").primaryKey(),
  value: integer("value").notNull().default(0),
});

export const insertTrackingCounterSchema = createInsertSchema(trackingCountersTable);
export type InsertTrackingCounter = z.infer<typeof insertTrackingCounterSchema>;
export type TrackingCounter = typeof trackingCountersTable.$inferSelect;
