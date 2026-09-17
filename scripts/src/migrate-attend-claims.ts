/**
 * One-time import of historical claims from the old ATTEND system into
 * this app's claims/claimEvidence/claimHistory tables.
 *
 * ATTEND had three claim statuses: pending, blocked, verified. None of them
 * map onto this app's "approved": reaching "approved" here requires having
 * passed through "verified", which requires complete identity + eligibility
 * + need evidence (see attendTransitions.ts). ATTEND only ever recorded one
 * undifferentiated artifact reference per claim, so an ATTEND "verified"
 * claim can't back this app's "verified"/"approved" guarantees. Likewise
 * "rejected" is terminal here and means a final denial, but ATTEND's
 * "blocked" meant stuck/waiting, not denied. So every ATTEND claim lands in
 * "submitted" (this app's own default status) and goes through real
 * re-verification under current evidence rules. Nothing is auto-approved or
 * auto-rejected.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run migrate-attend-claims -- \
 *     path/to/export.json [--commit]
 *
 * Without --commit, only a report is printed; nothing is written.
 */
import { randomUUID } from "crypto";
import { readFile } from "fs/promises";
import { ilike, eq } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  pool,
  claimsTable,
  claimEvidenceTable,
  claimHistoryTable,
  recipientAccountsTable,
  donationItemsTable,
} from "@workspace/db";

const attendStatuses = ["pending", "blocked", "verified"] as const;
type AttendStatus = (typeof attendStatuses)[number];

const statusMapping: Record<AttendStatus, "submitted"> = {
  pending: "submitted",
  verified: "submitted",
  blocked: "submitted",
};

const attendClaimSchema = z
  .object({
    id: z.number(),
    claimDescription: z.string(),
    status: z.enum(attendStatuses),
    artifactReference: z.string().nullable(),
    accountId: z.string().nullable(),
    linkedTransferId: z.string().nullable(),
    linkedItemId: z.string().nullable(),
    notes: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();

const attendExportSchema = z.array(attendClaimSchema);
type AttendClaim = z.infer<typeof attendClaimSchema>;

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

type SkipReason =
  | "missing_account_id"
  | "unmatched_account"
  | "missing_item_id"
  | "unmatched_item";

type Skipped = { entry: AttendClaim; reason: SkipReason };
type Migrated = { entry: AttendClaim; claimId: string };

async function resolveAccountId(accountId: string): Promise<string | undefined> {
  const [row] = await db
    .select({ id: recipientAccountsTable.id })
    .from(recipientAccountsTable)
    .where(ilike(recipientAccountsTable.name, escapeLikePattern(accountId)))
    .limit(1);
  return row?.id;
}

async function resolveItemId(linkedItemId: string): Promise<string | undefined> {
  const [row] = await db
    .select({ id: donationItemsTable.id })
    .from(donationItemsTable)
    .where(eq(donationItemsTable.itemId, linkedItemId))
    .limit(1);
  return row?.id;
}

function buildNotes(entry: AttendClaim): string {
  const parts = [`Migrated from ATTEND entry #${entry.id} (original status: ${entry.status}).`, entry.claimDescription];
  if (entry.notes) parts.push(entry.notes);
  if (entry.linkedTransferId) {
    parts.push(
      `ATTEND linkedTransferId "${entry.linkedTransferId}" was not resolved or migrated as a transfer.`,
    );
  }
  return parts.join("\n\n");
}

async function migrateEntry(entry: AttendClaim, commit: boolean): Promise<Migrated | Skipped> {
  if (!entry.accountId) return { entry, reason: "missing_account_id" };
  const accountId = await resolveAccountId(entry.accountId);
  if (!accountId) return { entry, reason: "unmatched_account" };

  if (!entry.linkedItemId) return { entry, reason: "missing_item_id" };
  const itemId = await resolveItemId(entry.linkedItemId);
  if (!itemId) return { entry, reason: "unmatched_item" };

  const claimId = randomUUID();
  if (!commit) return { entry, claimId };

  await db.transaction(async (tx) => {
    await tx.insert(claimsTable).values({
      id: claimId,
      accountId,
      itemId,
      status: "submitted",
      submittedBy: "attend-migration",
      approvedBy: null,
      notes: buildNotes(entry),
    });
    await tx.insert(claimHistoryTable).values({
      id: randomUUID(),
      claimId,
      fromStatus: null,
      toStatus: "submitted",
      by: "attend-migration",
      notes: `Imported from ATTEND entry #${entry.id}`,
    });
    if (entry.artifactReference && entry.artifactReference.trim().length > 0) {
      await tx.insert(claimEvidenceTable).values({
        id: randomUUID(),
        claimId,
        kind: "identity",
        reference: entry.artifactReference,
        createdBy: "attend-migration",
        note:
          "ATTEND only ever recorded one undifferentiated artifact reference per claim. " +
          "Eligibility and need evidence were never collected in ATTEND and are NOT fabricated here.",
      });
    }
  });

  return { entry, claimId };
}

function printReport(migrated: Migrated[], skipped: Skipped[], commit: boolean) {
  const bySkipReason = new Map<SkipReason, number>();
  for (const { reason } of skipped) bySkipReason.set(reason, (bySkipReason.get(reason) ?? 0) + 1);

  const downgraded = (status: AttendStatus) => migrated.filter(({ entry }) => entry.status === status).length;

  console.log(`\n${commit ? "Committed" : "Dry run (no writes)"} — ATTEND claims migration report`);
  console.log(`Total entries: ${migrated.length + skipped.length}`);
  console.log(`Migrated: ${migrated.length}`);
  console.log(`Skipped: ${skipped.length}`);
  for (const reason of ["missing_account_id", "unmatched_account", "missing_item_id", "unmatched_item"] as const) {
    console.log(`  - ${reason}: ${bySkipReason.get(reason) ?? 0}`);
  }
  console.log(`\nAll migrated claims land in "submitted" — none are auto-approved or auto-rejected.`);
  console.log(
    `  - Originally "verified" in ATTEND: ${downgraded("verified")} (downgraded to submitted — requires re-verification under current evidence rules)`,
  );
  console.log(
    `  - Originally "blocked" in ATTEND: ${downgraded("blocked")} (downgraded to submitted — requires re-verification under current evidence rules)`,
  );
  console.log(`  - Originally "pending" in ATTEND: ${downgraded("pending")} (submitted is this app's own default status)`);
}

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes("--commit");
  const filePath = args.find((arg) => !arg.startsWith("--"));

  if (!filePath) {
    console.error("Usage: migrate-attend-claims -- <path-to-export.json> [--commit]");
    process.exitCode = 1;
    return;
  }

  const raw = JSON.parse(await readFile(filePath, "utf-8"));
  const entries = attendExportSchema.parse(raw);

  const migrated: Migrated[] = [];
  const skipped: Skipped[] = [];
  for (const entry of entries) {
    const result = await migrateEntry(entry, commit);
    if ("reason" in result) skipped.push(result);
    else migrated.push(result);
  }

  printReport(migrated, skipped, commit);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void pool.end();
  });
