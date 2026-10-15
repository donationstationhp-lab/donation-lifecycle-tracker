import { integer, pgEnum, pgTable, text, timestamp, uniqueIndex, jsonb, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { itemIdentitiesTable } from "./itemIdentities";

export const snowCategoryTier = pgEnum("snow_category_tier", ["URGENT", "STABLE", "SURPLUS"]);
export const snowDecision = pgEnum("snow_decision", ["confirmed", "overridden", "manual", "notion_import"]);

// Kept outside donation_items: its existing tier field remains T.I.E.R. only.
export const itemSnowTable = pgTable("item_snow", {
  itemId: text("item_id").primaryKey().references(() => itemIdentitiesTable.id, { onDelete: "cascade" }),
  version: integer("version").notNull().default(0),
  proposalId: text("proposal_id"),
  proposedTier: snowCategoryTier("proposed_tier"),
  proposalSource: text("proposal_source"),
  proposedAt: timestamp("proposed_at", { withTimezone: true }),
  proposalRationale: text("proposal_rationale"),
  acceptedTier: snowCategoryTier("accepted_tier"),
  acceptedBy: text("accepted_by"),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  acceptedDecision: snowDecision("accepted_decision"),
  acceptedSource: text("accepted_source"),
}, (table) => [
  check("item_snow_proposal_complete", sql`
    (${table.proposalId} IS NULL AND ${table.proposedTier} IS NULL
      AND ${table.proposalSource} IS NULL AND ${table.proposedAt} IS NULL
      AND ${table.proposalRationale} IS NULL)
    OR (${table.proposalId} IS NOT NULL AND ${table.proposedTier} IS NOT NULL
      AND ${table.proposalSource} IS NOT NULL AND ${table.proposedAt} IS NOT NULL)
  `),
  check("item_snow_acceptance_complete", sql`
    (${table.acceptedTier} IS NULL AND ${table.acceptedBy} IS NULL
      AND ${table.acceptedAt} IS NULL AND ${table.acceptedDecision} IS NULL)
    OR (${table.acceptedTier} IS NOT NULL AND ${table.acceptedBy} IS NOT NULL
      AND ${table.acceptedAt} IS NOT NULL AND ${table.acceptedDecision} IS NOT NULL)
  `),
  check("item_snow_version_nonnegative", sql`${table.version} >= 0`),
]);

export const itemSnowHistoryTable = pgTable("item_snow_history", {
  id: text("id").primaryKey(),
  itemId: text("item_id").notNull().references(() => itemIdentitiesTable.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  previousTier: snowCategoryTier("previous_tier"),
  acceptedTier: snowCategoryTier("accepted_tier").notNull(),
  acceptedBy: text("accepted_by").notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull(),
  decision: snowDecision("decision").notNull(),
  source: text("source").notNull().default("Staff review"),
  reason: text("reason"),
  proposal: jsonb("proposal").$type<{
    id: string; tier: "URGENT" | "STABLE" | "SURPLUS";
    source: string; proposedAt: string; rationale: string | null;
  } | null>(),
}, (table) => [uniqueIndex("item_snow_history_item_version_idx").on(table.itemId, table.version)]);

export const insertItemSnowSchema = createInsertSchema(itemSnowTable);
export const insertItemSnowHistorySchema = createInsertSchema(itemSnowHistoryTable);
export type ItemSnow = typeof itemSnowTable.$inferSelect;
