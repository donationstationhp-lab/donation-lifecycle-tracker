import { pgTable, text, timestamp, date, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { itemIdentitiesTable } from "./itemIdentities";

// Local staff curation must survive a refresh of the immutable source baseline.
export const itemTierConfirmationsTable = pgTable("item_tier_confirmations", {
  itemId: text("item_id").primaryKey().references(() => itemIdentitiesTable.id, { onDelete: "cascade" }),
  tier: text("tier").notNull(),
  confirmedBy: text("confirmed_by").notNull(),
  confirmedOn: date("confirmed_on", { mode: "string" }).notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  reason: text("reason").notNull(),
});

// A versioned proposal is never discarded when a later proposer replaces it.
export const itemSnowProposalHistoryTable = pgTable("item_snow_proposal_history", {
  id: text("id").primaryKey(),
  itemId: text("item_id").notNull().references(() => itemIdentitiesTable.id, { onDelete: "cascade" }),
  tier: text("tier").notNull(),
  source: text("source").notNull(),
  proposedAt: timestamp("proposed_at", { withTimezone: true }).notNull(),
  rationale: text("rationale"),
});

// Preserve the inputs/output of each rules version, including abstentions.
export const itemSnowBacktestsTable = pgTable("item_snow_backtests", {
  id: text("id").primaryKey(),
  itemId: text("item_id").notNull().references(() => itemIdentitiesTable.id, { onDelete: "cascade" }),
  version: text("version").notNull(),
  evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull().defaultNow(),
  input: jsonb("input").notNull(),
  proposal: text("proposal"),
  rationale: text("rationale").notNull(),
});

export const insertItemTierConfirmationSchema = createInsertSchema(itemTierConfirmationsTable);
export const insertItemSnowProposalHistorySchema = createInsertSchema(itemSnowProposalHistoryTable);
export const insertItemSnowBacktestSchema = createInsertSchema(itemSnowBacktestsTable);
