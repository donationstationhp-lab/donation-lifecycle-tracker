import { pgTable, text, timestamp, jsonb, uniqueIndex, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

// Opaque identity is independent of whether a complete intake record exists.
// Null display IDs are intentional: unidentified records never get minted IDs.
export const itemIdentitiesTable = pgTable("item_identities", {
  id: text("id").primaryKey(),
  displayId: text("display_id").unique(),
  lineage: text("lineage").notNull(),
  name: text("name").notNull(),
  needsReview: boolean("needs_review").notNull().default(false),
  reviewFlags: jsonb("review_flags").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const itemExternalReferencesTable = pgTable("item_external_references", {
  id: text("id").primaryKey(),
  identityId: text("identity_id").notNull().references(() => itemIdentitiesTable.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  externalId: text("external_id").notNull(),
  url: text("url").notNull(),
}, (table) => [uniqueIndex("item_external_provider_id_unique").on(table.provider, table.externalId)]);

// Aliases never claim that two separate identities are the same item. A shared
// alias is deliberately ambiguous and exact lookup reports all candidates.
export const itemIdentityAliasesTable = pgTable("item_identity_aliases", {
  id: text("id").primaryKey(),
  identityId: text("identity_id").notNull().references(() => itemIdentitiesTable.id, { onDelete: "cascade" }),
  alias: text("alias").notNull(),
}, (table) => [uniqueIndex("item_identity_alias_once").on(table.identityId, table.alias)]);

export const notionItemSnapshotsTable = pgTable("notion_item_snapshots", {
  identityId: text("identity_id").primaryKey().references(() => itemIdentitiesTable.id, { onDelete: "cascade" }),
  notionPageId: text("notion_page_id").notNull().unique(),
  sourceItemId: text("source_item_id"),
  name: text("name").notNull(),
  category: text("category").notNull(),
  tier: text("tier"), // T.I.E.R. only; an absent value stays null.
  condition: text("condition"),
  stage: text("stage"),
  receivedDate: text("received_date"),
  expiryDate: text("expiry_date"),
  notes: text("notes").notNull(),
  source: text("source"),
  donor: text("donor"),
  acceptedTierFromNotion: text("accepted_tier_from_notion"),
  notionEditedAt: timestamp("notion_edited_at", { withTimezone: true }).notNull(),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertItemIdentitySchema = createInsertSchema(itemIdentitiesTable);
export const insertItemExternalReferenceSchema = createInsertSchema(itemExternalReferencesTable);
export const insertItemIdentityAliasSchema = createInsertSchema(itemIdentityAliasesTable);
export const insertNotionItemSnapshotSchema = createInsertSchema(notionItemSnapshotsTable);
