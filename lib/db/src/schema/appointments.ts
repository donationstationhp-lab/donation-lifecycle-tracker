import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { claimsTable, recipientAccountsTable, transfersTable } from "./attendLifecycle";
import { donationItemsTable } from "./donationItems";
import { locationsTable } from "./locations";

export const capacitySlotsTable = pgTable(
  "capacity_slots",
  {
    id: text("id").primaryKey(),
    locationId: text("location_id").notNull().references(() => locationsTable.id),
    appointmentType: text("appointment_type").notNull(),
    scheduledStart: timestamp("scheduled_start", { withTimezone: true }).notNull(),
    scheduledEnd: timestamp("scheduled_end", { withTimezone: true }).notNull(),
    maxBookings: integer("max_bookings").notNull().default(1),
    status: text("status").notNull().default("open"),
    bookingCutoff: timestamp("booking_cutoff", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => ({
    locationIndex: index("capacity_slots_location_idx").on(table.locationId),
    startIndex: index("capacity_slots_start_idx").on(table.scheduledStart),
    typeIndex: index("capacity_slots_type_idx").on(table.appointmentType),
  }),
);

export const appointmentsTable = pgTable(
  "appointments",
  {
    id: text("id").primaryKey(),
    appointmentType: text("appointment_type").notNull(),
    accountId: text("account_id").references(() => recipientAccountsTable.id),
    relatedClaimId: text("related_claim_id").references(() => claimsTable.id),
    relatedItemId: text("related_item_id").references(() => donationItemsTable.id),
    relatedTransferId: text("related_transfer_id").references(() => transfersTable.id),
    relatedDonationId: text("related_donation_id"),
    locationId: text("location_id").notNull().references(() => locationsTable.id),
    scheduledStart: timestamp("scheduled_start", { withTimezone: true }).notNull(),
    scheduledEnd: timestamp("scheduled_end", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("requested"),
    capacitySlotId: text("capacity_slot_id").references(() => capacitySlotsTable.id),
    staffAssigned: text("staff_assigned"),
    publicTrackingCode: text("public_tracking_code"),
    requestedTrackingCode: text("requested_tracking_code"),
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    pickupAddress: text("pickup_address"),
    internalNotes: text("internal_notes"),
    cancelReason: text("cancel_reason"),
    noShowReason: text("no_show_reason"),
    reservationExpiresAt: timestamp("reservation_expires_at", { withTimezone: true }),
    relatedOfferId: text("related_offer_id"),
    relatedBidId: text("related_bid_id"),
    relatedTradeId: text("related_trade_id"),
    relatedLedgerEntryId: text("related_ledger_entry_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => ({
    startIndex: index("appointments_start_idx").on(table.scheduledStart),
    statusIndex: index("appointments_status_idx").on(table.status),
    typeIndex: index("appointments_type_idx").on(table.appointmentType),
    slotIndex: index("appointments_slot_idx").on(table.capacitySlotId),
    claimIndex: index("appointments_claim_idx").on(table.relatedClaimId),
    itemIndex: index("appointments_item_idx").on(table.relatedItemId),
  }),
);

export const appointmentHistoryTable = pgTable(
  "appointment_history",
  {
    id: text("id").primaryKey(),
    appointmentId: text("appointment_id").notNull().references(() => appointmentsTable.id, { onDelete: "cascade" }),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    by: text("by").notNull(),
    notes: text("notes"),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    appointmentIndex: index("appointment_history_appointment_idx").on(table.appointmentId),
  }),
);

export const insertCapacitySlotSchema = createInsertSchema(capacitySlotsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export const insertAppointmentSchema = createInsertSchema(appointmentsTable).omit({
  createdAt: true,
  updatedAt: true,
});

export type CapacitySlot = typeof capacitySlotsTable.$inferSelect;
export type Appointment = typeof appointmentsTable.$inferSelect;
export type AppointmentHistory = typeof appointmentHistoryTable.$inferSelect;
export type InsertCapacitySlot = z.infer<typeof insertCapacitySlotSchema>;
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;