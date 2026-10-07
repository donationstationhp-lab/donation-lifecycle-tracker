import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { notificationOutboxTable } from "./attendLifecycle";

/**
 * Dead-letter record for ATTEND outbox deliveries that exhausted retries.
 * One row per failed `notification_outbox` entry so staff can see and
 * acknowledge delivery failures instead of them silently expiring.
 */
export const attendDeliveryAlertsTable = pgTable(
  "attend_delivery_alerts",
  {
    id: text("id").primaryKey(),
    outboxId: text("outbox_id").notNull().references(() => notificationOutboxTable.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    lastError: text("last_error").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    acknowledgedBy: text("acknowledged_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    outbox: uniqueIndex("attend_delivery_alerts_outbox_idx").on(table.outboxId),
    dedupe: uniqueIndex("attend_delivery_alerts_dedupe_idx").on(table.dedupeKey),
    createdIndex: index("attend_delivery_alerts_created_idx").on(table.createdAt),
  }),
);

export const insertAttendDeliveryAlertSchema = createInsertSchema(attendDeliveryAlertsTable).omit({
  createdAt: true,
});

export type AttendDeliveryAlert = typeof attendDeliveryAlertsTable.$inferSelect;
export type InsertAttendDeliveryAlert = z.infer<typeof insertAttendDeliveryAlertSchema>;
