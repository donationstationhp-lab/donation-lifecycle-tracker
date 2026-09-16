import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { pickupRequestsTable } from "./pickupRequests";

export const pickupContactAttemptsTable = pgTable("pickup_contact_attempts", {
  id: text("id").primaryKey(),
  pickupRequestId: text("pickup_request_id")
    .notNull()
    .references(() => pickupRequestsTable.id, { onDelete: "cascade" }),
  attemptNumber: integer("attempt_number").notNull(),
  result: text("result").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPickupContactAttemptSchema = createInsertSchema(
  pickupContactAttemptsTable,
).omit({
  createdAt: true,
});
export type InsertPickupContactAttempt = z.infer<typeof insertPickupContactAttemptSchema>;
export type PickupContactAttempt = typeof pickupContactAttemptsTable.$inferSelect;