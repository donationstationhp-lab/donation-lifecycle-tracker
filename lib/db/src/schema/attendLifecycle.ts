import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { donationItemsTable } from "./donationItems";

/**
 * ATTEND allocation records intentionally have their own history tables.
 * `stage_history` remains the inventory-stage audit trail.
 */
export const recipientAccountsTable = pgTable(
  "recipient_accounts",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => ({
    nameIndex: index("recipient_accounts_name_idx").on(table.name),
    typeIndex: index("recipient_accounts_type_idx").on(table.type),
  }),
);

export const claimsTable = pgTable(
  "claims",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull().references(() => recipientAccountsTable.id),
    itemId: text("item_id").notNull().references(() => donationItemsTable.id),
    status: text("status").notNull().default("submitted"),
    submittedBy: text("submitted_by").notNull(),
    approvedBy: text("approved_by"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => ({
    accountIndex: index("claims_account_idx").on(table.accountId),
    itemIndex: index("claims_item_idx").on(table.itemId),
    statusIndex: index("claims_status_idx").on(table.status),
  }),
);

export const claimEvidenceTable = pgTable(
  "claim_evidence",
  {
    id: text("id").primaryKey(),
    claimId: text("claim_id").notNull().references(() => claimsTable.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    reference: text("reference").notNull(),
    note: text("note").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({ claimIndex: index("claim_evidence_claim_idx").on(table.claimId) }),
);

export const claimHistoryTable = pgTable(
  "claim_history",
  {
    id: text("id").primaryKey(),
    claimId: text("claim_id").notNull().references(() => claimsTable.id, { onDelete: "cascade" }),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    by: text("by").notNull(),
    notes: text("notes"),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({ claimIndex: index("claim_history_claim_idx").on(table.claimId) }),
);

export const transfersTable = pgTable(
  "transfers",
  {
    id: text("id").primaryKey(),
    claimId: text("claim_id").notNull().references(() => claimsTable.id),
    accountId: text("account_id").notNull().references(() => recipientAccountsTable.id),
    itemId: text("item_id").notNull().references(() => donationItemsTable.id),
    status: text("status").notNull().default("planned"),
    releasedBy: text("released_by"),
    receivedBy: text("received_by"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => ({
    claimIndex: index("transfers_claim_idx").on(table.claimId),
    accountIndex: index("transfers_account_idx").on(table.accountId),
    itemIndex: index("transfers_item_idx").on(table.itemId),
    statusIndex: index("transfers_status_idx").on(table.status),
    activeClaim: uniqueIndex("transfers_active_claim_idx").on(table.claimId).where(sql`${table.status} <> 'cancelled'`),
    activeItem: uniqueIndex("transfers_active_item_idx").on(table.itemId).where(sql`${table.status} <> 'cancelled'`),
  }),
);

export const transferHistoryTable = pgTable(
  "transfer_history",
  {
    id: text("id").primaryKey(),
    transferId: text("transfer_id").notNull().references(() => transfersTable.id, { onDelete: "cascade" }),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    by: text("by").notNull(),
    notes: text("notes"),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({ transferIndex: index("transfer_history_transfer_idx").on(table.transferId) }),
);

export const notificationOutboxTable = pgTable(
  "notification_outbox",
  {
    id: text("id").primaryKey(),
    eventType: text("event_type").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    payload: text("payload").notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    processingLeaseUntil: timestamp("processing_lease_until", { withTimezone: true }),
    processingLeaseToken: text("processing_lease_token"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    dedupe: uniqueIndex("notification_outbox_dedupe_idx").on(table.dedupeKey),
    pendingIndex: index("notification_outbox_status_idx").on(table.status),
    retryIndex: index("notification_outbox_retry_idx").on(table.status, table.nextRetryAt),
  }),
);

export const insertRecipientAccountSchema = createInsertSchema(recipientAccountsTable).omit({ createdAt: true, updatedAt: true });
export const insertClaimSchema = createInsertSchema(claimsTable).omit({ createdAt: true, updatedAt: true });
export const insertClaimEvidenceSchema = createInsertSchema(claimEvidenceTable).omit({ createdAt: true });
export const insertClaimHistorySchema = createInsertSchema(claimHistoryTable).omit({ timestamp: true });
export const insertTransferSchema = createInsertSchema(transfersTable).omit({ createdAt: true, updatedAt: true });
export const insertTransferHistorySchema = createInsertSchema(transferHistoryTable).omit({ timestamp: true });
export const insertNotificationOutboxSchema = createInsertSchema(notificationOutboxTable).omit({ createdAt: true, sentAt: true });

export type RecipientAccount = typeof recipientAccountsTable.$inferSelect;
export type Claim = typeof claimsTable.$inferSelect;
export type ClaimEvidence = typeof claimEvidenceTable.$inferSelect;
export type ClaimHistory = typeof claimHistoryTable.$inferSelect;
export type Transfer = typeof transfersTable.$inferSelect;
export type TransferHistory = typeof transferHistoryTable.$inferSelect;
export type NotificationOutbox = typeof notificationOutboxTable.$inferSelect;
export type InsertRecipientAccount = z.infer<typeof insertRecipientAccountSchema>;
export type InsertClaim = z.infer<typeof insertClaimSchema>;
export type InsertClaimEvidence = z.infer<typeof insertClaimEvidenceSchema>;
export type InsertClaimHistory = z.infer<typeof insertClaimHistorySchema>;
export type InsertTransfer = z.infer<typeof insertTransferSchema>;
export type InsertTransferHistory = z.infer<typeof insertTransferHistorySchema>;
export type InsertNotificationOutbox = z.infer<typeof insertNotificationOutboxSchema>;