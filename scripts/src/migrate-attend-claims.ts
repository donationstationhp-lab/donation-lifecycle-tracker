/**
 * One-time import of historical claims from the retired ATTEND system into
 * this app's claims/claimEvidence/claimHistory tables.
 *
 * All three ATTEND statuses (pending, blocked, verified) map to "submitted" —
 * the only status this app itself ever creates a claim in. ATTEND's
 * "verified" only ever recorded one undifferentiated artifact reference, so
 * it can't satisfy this app's verified->approved evidence gate (identity +
 * eligibility + need); ATTEND's "blocked" meant "stuck", not a final denial,
 * so it can't be mapped onto this app's terminal "rejected" status. Every
 * migrated claim lands in "submitted" and goes through real re-verification.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run migrate-attend-claims -- \
 *     ./attend-export.json [--commit]
 *
 * Without --commit, only the report is printed; nothing is written.
 */
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { resolve } from "path";
import { eq, ilike } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  pool,
  recipientAccountsTable,
  donationItemsTable,
  claimsTable,
  claimEvidenceTable,
  claimHistoryTable,
} from "@workspace/db";

const attendClaimStatuses = ["pending", "blocked", "verified"] as const;
type AttendClaimStatus = (typeof attendClaimStatuses)[number];

const statusMapping: Record<AttendClaimStatus, "submitted"> = {
  pending: "submitted",
  verified: "submitted",
  blocked: "submitted",
};

const attendClaimEntrySchema = z
  .object({
    id: z.number(),
    claimDescription: z.string(),
    status: z.enum(attendClaimStatuses),
    artifactReference: z.string().nullable(),
    accountId: z.string().nullable(),
    linkedTransferId: z.string().nullable(),
    linkedItemId: z.string().nullable(),
    notes: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();

const attendExportSchema = z.array(attendClaimEntrySchema);
type AttendClaimEntry = z.infer<typeof attendClaimEntrySchema>;

function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

type SkipReason =
  | "missing-account-id"
  | "unmatched-account"
  | "missing-item-id"
  | "unmatched-item";

async function resolveAccountId(accountId: string): Promise<string | undefined> {
  const [account] = await db
    .select({ id: recipientAccountsTable.id })
    .from(recipientAccountsTable)
    .where(ilike(recipientAccountsTable.name, escapeLikePattern(accountId)))
    .limit(1);
  return account?.id;
}

async function resolveItemId(linkedItemId: string): Promise<string | undefined> {
  const [item] = await db
    .select({ id: donationItemsTable.id })
    .from(donationItemsTable)
    .where(eq(donationItemsTable.itemId, linkedItemId))
    .limit(1);
  return item?.id;
}

function buildNotes(entry: AttendClaimEntry): string {
  const parts = [
    `Migrated from ATTEND entry #${entry.id} (original status: ${entry.status}).`,
    entry.claimDescription,
  ];
  if (entry.notes) parts.push(entry.notes);
  if (entry.linkedTransferId) {
    parts.push(
      `Original ATTEND linkedTransferId: ${entry.linkedTransferId} (not resolved/not migrated as a transfer).`,
    );
  }
  return parts.join("\n\n");
}

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes("--commit");
  const exportPath = args.find((arg) => !arg.startsWith("--"));

  if (!exportPath) {
    console.error("Usage: migrate-attend-claims -- <path-to-export.json> [--commit]");
    process.exitCode = 1;
    return;
  }

  const raw = JSON.parse(readFileSync(resolve(exportPath), "utf8"));
  const entries = attendExportSchema.parse(raw);

  let migrated = 0;
  let evidenceInserted = 0;
  let downgradedFromVerified = 0;
  let downgradedFromBlocked = 0;
  const skips: { attendId: number; reason: SkipReason }[] = [];

  for (const entry of entries) {
    if (!entry.accountId) {
      skips.push({ attendId: entry.id, reason: "missing-account-id" });
      continue;
    }
    if (!entry.linkedItemId) {
      skips.push({ attendId: entry.id, reason: "missing-item-id" });
      continue;
    }

    const accountId = await resolveAccountId(entry.accountId);
    if (!accountId) {
      skips.push({ attendId: entry.id, reason: "unmatched-account" });
      continue;
    }

    const itemId = await resolveItemId(entry.linkedItemId);
    if (!itemId) {
      skips.push({ attendId: entry.id, reason: "unmatched-item" });
      continue;
    }

    const targetStatus = statusMapping[entry.status];
    const claimId = randomUUID();
    const hasArtifact = Boolean(entry.artifactReference && entry.artifactReference.trim().length > 0);

    if (commit) {
      await db.insert(claimsTable).values({
        id: claimId,
        accountId,
        itemId,
        status: targetStatus,
        submittedBy: "attend-migration",
        approvedBy: null,
        notes: buildNotes(entry),
      });

      await db.insert(claimHistoryTable).values({
        id: randomUUID(),
        claimId,
        fromStatus: null,
        toStatus: targetStatus,
        by: "attend-migration",
        notes: `Migrated from ATTEND entry #${entry.id}.`,
      });

      if (hasArtifact) {
        await db.insert(claimEvidenceTable).values({
          id: randomUUID(),
          claimId,
          kind: "identity",
          reference: entry.artifactReference as string,
          note:
            "ATTEND only ever recorded one undifferentiated artifact reference. " +
            "Eligibility and need evidence were never collected in ATTEND and are NOT fabricated here.",
          createdBy: "attend-migration",
        });
      }
    }

    migrated++;
    if (hasArtifact) evidenceInserted++;
    if (entry.status === "verified") downgradedFromVerified++;
    if (entry.status === "blocked") downgradedFromBlocked++;
  }

  console.log(commit ? "ATTEND claim migration — COMMITTED" : "ATTEND claim migration — DRY RUN (pass --commit to write)");
  console.log(`  Total entries in export: ${entries.length}`);
  console.log(`  Migrated: ${migrated}`);
  console.log(`    - evidence rows ${commit ? "inserted" : "that would be inserted"}: ${evidenceInserted}`);
  console.log(
    `    - originally "verified" in ATTEND, downgraded to submitted — requires re-verification under current evidence rules: ${downgradedFromVerified}`,
  );
  console.log(
    `    - originally "blocked" in ATTEND, downgraded to submitted — requires re-verification under current evidence rules: ${downgradedFromBlocked}`,
  );
  console.log(`  Skipped: ${skips.length}`);

  const skipCounts = skips.reduce<Record<SkipReason, number>>(
    (acc, skip) => {
      acc[skip.reason]++;
      return acc;
    },
    { "missing-account-id": 0, "unmatched-account": 0, "missing-item-id": 0, "unmatched-item": 0 },
  );
  for (const [reason, count] of Object.entries(skipCounts)) {
    if (count > 0) console.log(`    - ${reason}: ${count}`);
  }
  if (skips.length > 0) {
    console.log("  Skipped entry ids:");
    for (const skip of skips) {
      console.log(`    - ATTEND entry #${skip.attendId}: ${skip.reason}`);
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void pool.end();
  });
