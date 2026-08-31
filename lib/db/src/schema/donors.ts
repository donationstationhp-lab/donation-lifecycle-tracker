import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const donorsTable = pgTable("donors", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  contact: text("contact"),
  organization: text("organization"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDonorSchema = createInsertSchema(donorsTable).omit({
  createdAt: true,
});
export type InsertDonor = z.infer<typeof insertDonorSchema>;
export type Donor = typeof donorsTable.$inferSelect;
