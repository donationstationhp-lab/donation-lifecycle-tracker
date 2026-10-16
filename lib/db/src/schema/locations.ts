import { pgTable, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agentsTable } from "./agents";

export const locationsTable = pgTable("locations", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").references(() => agentsTable.id),
  code: text("code").notNull().unique(),
  zone: text("zone").notNull(),
  capacity: real("capacity"),
  description: text("description"),
  tempZone: text("temp_zone").notNull().default("ambient"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLocationSchema = createInsertSchema(locationsTable).omit({
  createdAt: true,
});
export type InsertLocation = z.infer<typeof insertLocationSchema>;
export type Location = typeof locationsTable.$inferSelect;
