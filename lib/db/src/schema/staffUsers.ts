import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const staffUsersTable = pgTable("staff_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertStaffUserSchema = createInsertSchema(staffUsersTable).omit({
  createdAt: true,
});
export type InsertStaffUser = z.infer<typeof insertStaffUserSchema>;
export type StaffUser = typeof staffUsersTable.$inferSelect;
