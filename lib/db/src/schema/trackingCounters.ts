import { index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { claimsTable } from "./attendLifecycle";

// Ported from the live Replit workspace (branch sync-live-schema) to match
// its existing data: allocates DSC-###### claim tracking codes
// (claimsTable.trackingCode). Not the same table as item_id_counters —
// see that file's comment for why the two counters live under different
// names despite the GitHub-side one originally being called the same
// thing as this.
export const trackingCountersTable = pgTable("tracking_counters", {
  name: text("name").primaryKey(),
  nextNumber: integer("next_number").notNull(),
});

// Ported from the live Replit workspace. One-time-code records for
// verifying a claim at pickup/transfer; references claimsTable.id.
export const trackingOtpsTable = pgTable(
  "tracking_otps",
  {
    id: text("id").primaryKey(),
    claimId: text("claim_id").notNull().references(() => claimsTable.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    claimIndex: index("tracking_otps_claim_idx").on(table.claimId),
    expiryIndex: index("tracking_otps_expiry_idx").on(table.expiresAt, table.id),
    usedIndex: index("tracking_otps_used_idx").on(table.usedAt, table.id),
  }),
);

export const insertTrackingCounterSchema = createInsertSchema(trackingCountersTable);
export const insertTrackingOtpSchema = createInsertSchema(trackingOtpsTable).omit({
  createdAt: true,
  usedAt: true,
});

export type TrackingCounter = typeof trackingCountersTable.$inferSelect;
export type InsertTrackingCounter = z.infer<typeof insertTrackingCounterSchema>;
export type TrackingOtp = typeof trackingOtpsTable.$inferSelect;
export type InsertTrackingOtp = z.infer<typeof insertTrackingOtpSchema>;
