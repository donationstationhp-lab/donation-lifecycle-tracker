import { pgTable, text, integer, date, timestamp, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";

// Sites are not shelves: locations remain storage zones underneath an agent.
export const agentsTable = pgTable("agents", {
  id: text("id").primaryKey(),
  number: integer("number").notNull().unique(),
  fullName: text("full_name").notNull(),
  shortName: text("short_name").notNull(),
  address: text("address").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull(),
  sku: text("sku"),
  owner: text("owner").notNull().default("CIA"),
  operator: text("operator").notNull().default("Donation Station"),
  notes: text("notes").notNull().default(""),
  joinedOn: date("joined_on", { mode: "string" }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("agents_number_positive", sql`${t.number} > 0`),
  check("agents_type_valid", sql`${t.type} IN ('CIA-provided','host-permitted')`),
  check("agents_status_valid", sql`${t.status} IN ('active','seasonal','planned')`),
]);

export const agentDaysTable = pgTable("agent_days", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull().references(() => agentsTable.id),
  day: date("day", { mode: "string" }).notNull(),
  state: text("state").notNull(),
  // Intake bounds are derived from shared inventory, never independently entered.
  recordedBy: text("recorded_by").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("agent_days_agent_day_unique").on(t.agentId, t.day),
  check("agent_days_state_valid", sql`${t.state} IN ('Intake','Idle','Closed')`),
]);

export const insertAgentSchema = createInsertSchema(agentsTable);
export const insertAgentDaySchema = createInsertSchema(agentDaysTable);
export type Agent = typeof agentsTable.$inferSelect;
