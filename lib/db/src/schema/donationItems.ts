import { pgTable, text, real, timestamp, date, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { donorsTable } from "./donors";

export const donationItemsTable = pgTable("donation_items", {
  id: text("id").primaryKey(),
  itemId: text("item_id").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  tier: text("tier").notNull(), // T | I | E | R
  condition: text("condition").notNull(), // good | fair | poor | excellent
  donor: text("donor").notNull(),
  donorId: text("donor_id").references(() => donorsTable.id),
  recipient: text("recipient"),
  location: text("location"),
  expiryDate: date("expiry_date", { mode: "string" }),
  temperatureZone: text("temperature_zone").notNull().default("ambient"), // ambient | refrigerated | frozen
  weight: real("weight"),
  origin: text("origin"),
  lotNumber: text("lot_number").notNull(),
  powerConnectionReading: text("power_connection_reading").notNull().default(""),
  stage: text("stage").notNull().default("intake"), // intake | qc | storage | distributed
  pendingReview: boolean("pending_review").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDonationItemSchema = createInsertSchema(donationItemsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertDonationItem = z.infer<typeof insertDonationItemSchema>;
export type DonationItem = typeof donationItemsTable.$inferSelect;
