import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Ownership is deliberately a staff-mediated, polymorphic link. Public
 * tracking codes, names, phone numbers, and email addresses are not proof of
 * ownership, so none of those values can create a community link.
 */
export const communityOwnershipTable = pgTable(
  "community_ownership",
  {
    id: text("id").primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    recordType: text("record_type").notNull(),
    recordId: text("record_id").notNull(),
    verifiedBy: text("verified_by").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userRecord: uniqueIndex("community_ownership_user_record_idx").on(
      table.clerkUserId,
      table.recordType,
      table.recordId,
    ),
    recordOwner: uniqueIndex("community_ownership_record_owner_idx").on(
      table.recordType,
      table.recordId,
    ),
    userIndex: index("community_ownership_user_idx").on(table.clerkUserId),
    recordIndex: index("community_ownership_record_idx").on(table.recordType, table.recordId),
  }),
);

export const insertCommunityOwnershipSchema = createInsertSchema(
  communityOwnershipTable,
).omit({ createdAt: true, verifiedAt: true });

export type CommunityOwnership = typeof communityOwnershipTable.$inferSelect;
export type InsertCommunityOwnership = z.infer<typeof insertCommunityOwnershipSchema>;