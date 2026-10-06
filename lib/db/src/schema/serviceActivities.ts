import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { appointmentsTable } from "./appointments";
import { claimsTable, recipientAccountsTable } from "./attendLifecycle";
import { donationItemsTable } from "./donationItems";
import { pickupRequestsTable } from "./pickupRequests";

export const serviceActivitiesTable = pgTable(
  "service_activities",
  {
    id: text("id").primaryKey(),
    activityType: text("activity_type").notNull(),
    loopStage: text("loop_stage").notNull(),
    relatedItemId: text("related_item_id").references(() => donationItemsTable.id, { onDelete: "set null" }),
    relatedClaimId: text("related_claim_id").references(() => claimsTable.id, { onDelete: "set null" }),
    relatedAppointmentId: text("related_appointment_id").references(() => appointmentsTable.id, { onDelete: "set null" }),
    relatedPickupId: text("related_pickup_id").references(() => pickupRequestsTable.id, { onDelete: "set null" }),
    relatedAccountId: text("related_account_id").references(() => recipientAccountsTable.id, { onDelete: "set null" }),
    parentActivityId: text("parent_activity_id"),
    publicTrackingCode: text("public_tracking_code"),
    status: text("status").notNull(),
    staffOwner: text("staff_owner"),
    scheduledStart: timestamp("scheduled_start", { withTimezone: true }),
    scheduledEnd: timestamp("scheduled_end", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    publicSafeSummary: text("public_safe_summary"),
    internalNotes: text("internal_notes"),
    relatedOfferId: text("related_offer_id"),
    relatedBidId: text("related_bid_id"),
    relatedTradeId: text("related_trade_id"),
    relatedLedgerEntryId: text("related_ledger_entry_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => ({
    idempotencyUnique: uniqueIndex("service_activities_idempotency_idx").on(table.idempotencyKey),
    trackingIndex: index("service_activities_tracking_idx").on(table.publicTrackingCode),
    scheduleIndex: index("service_activities_schedule_idx").on(table.scheduledStart),
    statusIndex: index("service_activities_status_idx").on(table.status),
    typeIndex: index("service_activities_type_idx").on(table.activityType),
    claimIndex: index("service_activities_claim_idx").on(table.relatedClaimId),
    itemIndex: index("service_activities_item_idx").on(table.relatedItemId),
    appointmentIndex: index("service_activities_appointment_idx").on(table.relatedAppointmentId),
    pickupIndex: index("service_activities_pickup_idx").on(table.relatedPickupId),
  }),
);

export const insertServiceActivitySchema = createInsertSchema(serviceActivitiesTable).omit({
  createdAt: true,
  updatedAt: true,
});

export type ServiceActivity = typeof serviceActivitiesTable.$inferSelect;
export type InsertServiceActivity = z.infer<typeof insertServiceActivitySchema>;