import { check, index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { donationItemsTable } from "./donationItems";

// Source offer and staff-confirmed received facts remain separate.
export type DonationOfferDetails = {
  name: string;
  donorName?: string;
  category?: string;
  condition?: "excellent" | "good" | "fair" | "poor";
  quantity?: number;
  perishable?: boolean;
  expiryDate?: string | null;
  temperatureZone?: "ambient" | "refrigerated" | "frozen";
  weight?: number | null;
  origin?: string | null;
  notes?: string;
};

export const donationSubmissionsTable = pgTable("donation_submissions", {
  id: text("id").primaryKey(),
  reference: text("reference").notNull().unique(),
  status: text("status").$type<"submitted" | "approved" | "declined" | "received">()
    .notNull().default("submitted"),
  offeredDetails: jsonb("offered_details").$type<DonationOfferDetails>().notNull(),
  receivedDetails: jsonb("received_details").$type<DonationOfferDetails>(),
  receivedItemId: text("received_item_id").unique().references(() => donationItemsTable.id),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  receivedBy: text("received_by"),
  receivedAt: timestamp("received_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("donation_submissions_status_created_idx").on(table.status, table.createdAt),
  check("donation_submissions_status_valid", sql`${table.status} IN ('submitted','approved','declined','received')`),
  check("donation_submissions_reference_valid", sql`
    ${table.reference} = 'SUB-' || ${table.id}
    AND ${table.id} ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'`),
  check("donation_submissions_review_complete", sql`
    (${table.status} = 'submitted' AND ${table.reviewedAt} IS NULL AND ${table.reviewedBy} IS NULL)
    OR (${table.status} <> 'submitted' AND ${table.reviewedAt} IS NOT NULL AND ${table.reviewedBy} IS NOT NULL)`),
  check("donation_submissions_receipt_complete", sql`
    (${table.status} = 'received' AND ${table.receivedDetails} IS NOT NULL
      AND ${table.receivedItemId} IS NOT NULL AND ${table.receivedAt} IS NOT NULL AND ${table.receivedBy} IS NOT NULL)
    OR (${table.status} <> 'received' AND ${table.receivedDetails} IS NULL
      AND ${table.receivedItemId} IS NULL AND ${table.receivedAt} IS NULL AND ${table.receivedBy} IS NULL)`),
]);

export const insertDonationSubmissionSchema = createInsertSchema(donationSubmissionsTable);
export type DonationSubmission = typeof donationSubmissionsTable.$inferSelect;
