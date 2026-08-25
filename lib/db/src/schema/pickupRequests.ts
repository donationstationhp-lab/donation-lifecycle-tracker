import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { deliveryRoutesTable } from "./deliveryRoutes";

export const pickupRequestsTable = pgTable(
  "pickup_requests",
  {
    id: text("id").primaryKey(),
    status: text("status").notNull().default("unverified"),
    phone: text("phone").notNull(),
    name: text("name"),
    address: text("address").notNull(),
    addressConfirmed: boolean("address_confirmed").notNull().default(false),
    addressVerified: boolean("address_verified").notNull().default(false),
    addressType: text("address_type").notNull().default("other"),
    requestedWindow: text("requested_window").notNull(),
    confirmedDatetime: timestamp("confirmed_datetime", { withTimezone: true }),
    itemsDescribed: text("items_described"),
    itemsReceived: text("items_received"),
    confirmationSent: boolean("confirmation_sent").notNull().default(false),
    confirmationReplied: boolean("confirmation_replied").notNull().default(false),
    outcome: text("outcome"),
    outcomeNotes: text("outcome_notes"),
    phoneFlagged: boolean("phone_flagged").notNull().default(false),
    addressFlagged: boolean("address_flagged").notNull().default(false),
    requiresSupervisorApproval: boolean("requires_supervisor_approval").notNull().default(false),
    assignedDriver: text("assigned_driver"),
    linkedRouteId: text("linked_route_id").references(() => deliveryRoutesTable.id, {
      onDelete: "set null",
    }),
    contactAttempts: integer("contact_attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    phoneIndex: uniqueIndex("pickup_requests_phone_idx").on(table.phone, table.id),
  }),
);

export const insertPickupRequestSchema = createInsertSchema(pickupRequestsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertPickupRequest = z.infer<typeof insertPickupRequestSchema>;
export type PickupRequest = typeof pickupRequestsTable.$inferSelect;