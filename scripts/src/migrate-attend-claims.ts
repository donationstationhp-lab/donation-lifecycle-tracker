/**
 * Imports historical claim records from a legacy export into this app's
 * claims lifecycle (claims / claim_evidence / claim_history).
 *
 * Dry-run by default — it only prints a report. Pass --commit to write.
 *
 * Input is a JSON file holding an array of LegacyClaimRecord (see the type
 * below). Recipient accounts are matched by name (case-insensitive) and type;
 * items are matched by their human-readable itemId. Records that don't match
 * an existing account/item, or whose status can't be read, are skipped and
 * reported rather than guessed at — same as a missing match on either side.
 *
 * Status mapping:
 *   This app's claim lifecycle (artifacts/api-server/src/lib/attendTransitions.ts)
 *   only has submitted -> verified -> approved -> (fulfilled, via a received
 *   transfer) with rejected/cancelled as dead ends (no outgoing transitions).
 *   There is no "on hold" / "stuck" status. A legacy status that means
 *   "progress stalled, no decision made yet" (e.g. "blocked", "on_hold") is
 *   therefore mapped to "submitted", not "rejected": "submitted" asserts only
 *   that no decision is recorded, which is true of any stalled claim by
 *   definition, whereas "rejected" would assert a final denial that may never
 *   have happened — and since rejected has no outgoing transitions here, that
 *   false assertion would also be unrecoverable through the app itself. These
 *   mappings are reported separately (lowConfidenceMappings) so staff can
 *   follow up and make the real call.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run migrate-attend-claims -- \
 *     --input ./legacy-claims.json [--commit]
 */
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { and, eq, ilike, like } from "drizzle-orm";
import {
  db,
  pool,
  claimsTable,
  claimEvidenceTable,
  claimHistoryTable,
  donationItemsTable,
  recipientAccountsTable,
} from "@workspace/db";

// The claims lifecycle lives in the api-server app
// (artifacts/api-server/src/lib/attendTransitions.ts), not in @workspace/db —
// claimsTable.status is plain text at the schema level, so this mirrors that
// app's ClaimStatus/claimStatuses rather than importing across apps.
type ClaimStatus = "submitted" | "verified" | "approved" | "fulfilled" | "rejected" | "cancelled";

interface LegacyClaimEvidence {
  kind: string;
  reference: string;
  note: string;
  createdBy?: string;
}

interface LegacyClaimRecord {
  legacyId: string;
  accountName: string;
  accountType: string;
  itemId: string;
  status: string;
  submittedBy: string;
  approvedBy?: string;
  notes?: string;
  submittedAt?: string;
  evidence?: LegacyClaimEvidence[];
}

// Legacy statuses with a direct, confident equivalent in this app's lifecycle.
const STATUS_MAP: Partial<Record<string, ClaimStatus>> = {
  pending: "submitted",
  new: "submitted",
  submitted: "submitted",
  verified: "verified",
  approved: "approved",
  denied: "rejected",
  rejected: "rejected",
  fulfilled: "fulfilled",
  completed: "fulfilled",
  delivered: "fulfilled",
  cancelled: "cancelled",
  canceled: "cancelled",
  withdrawn: "cancelled",
};

// Legacy statuses meaning "stalled, no decision made" — see the module
// comment above for why these map to "submitted" rather than "rejected".
const STALLED_STATUSES = new Set([
  "blocked",
  "on_hold",
  "onhold",
  "on-hold",
  "held",
  "stuck",
  "waiting",
  "needs_info",
  "needs-info",
]);

interface StatusResolution {
  target: ClaimStatus;
  confident: boolean;
}

function resolveStatus(rawStatus: string): StatusResolution | undefined {
  const normalized = rawStatus.trim().toLowerCase();
  const mapped = STATUS_MAP[normalized];
  if (mapped) return { target: mapped, confident: true };
  if (STALLED_STATUSES.has(normalized)) return { target: "submitted", confident: false };
  return undefined;
}

function legacyMarker(legacyId: string): string {
  return `[legacy:${legacyId}]`;
}

interface MigrationReport {
  migrated: number;
  alreadyMigrated: string[];
  skippedInvalidRecord: { legacyId: string; reason: string }[];
  skippedUnmatchedAccount: { legacyId: string; accountName: string; accountType: string }[];
  skippedUnmatchedItem: { legacyId: string; itemId: string }[];
  skippedUnknownStatus: { legacyId: string; status: string }[];
  lowConfidenceMappings: { legacyId: string; sourceStatus: string; target: ClaimStatus }[];
}

function readFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1 || index === args.length - 1) return undefined;
  return args[index + 1];
}

function printReport(report: MigrationReport, commit: boolean): void {
  console.log(`\n${commit ? "Migration" : "Dry run"} complete.`);
  console.log(`  Migrated: ${report.migrated}`);
  console.log(`  Already migrated (skipped): ${report.alreadyMigrated.length}`);
  console.log(`  Skipped, invalid record: ${report.skippedInvalidRecord.length}`);
  console.log(`  Skipped, no matching account: ${report.skippedUnmatchedAccount.length}`);
  console.log(`  Skipped, no matching item: ${report.skippedUnmatchedItem.length}`);
  console.log(`  Skipped, unrecognized status: ${report.skippedUnknownStatus.length}`);
  console.log(`  Low-confidence mappings (migrated, needs review): ${report.lowConfidenceMappings.length}`);

  for (const entry of report.skippedInvalidRecord) {
    console.log(`    [invalid] ${entry.legacyId}: ${entry.reason}`);
  }
  for (const entry of report.skippedUnmatchedAccount) {
    console.log(`    [no account] ${entry.legacyId}: "${entry.accountName}" (${entry.accountType})`);
  }
  for (const entry of report.skippedUnmatchedItem) {
    console.log(`    [no item] ${entry.legacyId}: itemId "${entry.itemId}"`);
  }
  for (const entry of report.skippedUnknownStatus) {
    console.log(`    [unknown status] ${entry.legacyId}: "${entry.status}"`);
  }
  for (const entry of report.lowConfidenceMappings) {
    console.log(`    [needs review] ${entry.legacyId}: "${entry.sourceStatus}" -> "${entry.target}"`);
  }

  if (!commit && report.migrated > 0) {
    console.log("\nThis was a dry run — no rows were written. Re-run with --commit to apply.");
  }
}

async function migrateRecord(
  record: LegacyClaimRecord,
  commit: boolean,
  report: MigrationReport,
): Promise<void> {
  if (!record.legacyId || !record.accountName || !record.accountType || !record.itemId || !record.status || !record.submittedBy) {
    report.skippedInvalidRecord.push({
      legacyId: record.legacyId ?? "(missing legacyId)",
      reason: "missing one of: legacyId, accountName, accountType, itemId, status, submittedBy",
    });
    return;
  }

  const [alreadyMigrated] = await db
    .select({ id: claimHistoryTable.id })
    .from(claimHistoryTable)
    .where(like(claimHistoryTable.notes, `%${legacyMarker(record.legacyId)}%`))
    .limit(1);
  if (alreadyMigrated) {
    report.alreadyMigrated.push(record.legacyId);
    return;
  }

  const resolution = resolveStatus(record.status);
  if (!resolution) {
    report.skippedUnknownStatus.push({ legacyId: record.legacyId, status: record.status });
    return;
  }

  const [account] = await db
    .select({ id: recipientAccountsTable.id })
    .from(recipientAccountsTable)
    .where(and(ilike(recipientAccountsTable.name, record.accountName), eq(recipientAccountsTable.type, record.accountType)))
    .limit(1);
  if (!account) {
    report.skippedUnmatchedAccount.push({
      legacyId: record.legacyId,
      accountName: record.accountName,
      accountType: record.accountType,
    });
    return;
  }

  const [item] = await db
    .select({ id: donationItemsTable.id })
    .from(donationItemsTable)
    .where(eq(donationItemsTable.itemId, record.itemId))
    .limit(1);
  if (!item) {
    report.skippedUnmatchedItem.push({ legacyId: record.legacyId, itemId: record.itemId });
    return;
  }

  if (!resolution.confident) {
    report.lowConfidenceMappings.push({
      legacyId: record.legacyId,
      sourceStatus: record.status,
      target: resolution.target,
    });
  }

  if (!commit) {
    report.migrated += 1;
    return;
  }

  const claimId = randomUUID();
  const createdAt = record.submittedAt ? new Date(record.submittedAt) : new Date();
  const historyNotes = [
    `Imported from legacy claim ${record.legacyId} (status: "${record.status}")`,
    resolution.confident ? undefined : "Needs review: stalled legacy status mapped to submitted, not a confirmed decision.",
    legacyMarker(record.legacyId),
  ]
    .filter(Boolean)
    .join(" ");

  await db.transaction(async (tx) => {
    await tx.insert(claimsTable).values({
      id: claimId,
      accountId: account.id,
      itemId: item.id,
      status: resolution.target,
      submittedBy: record.submittedBy,
      approvedBy: record.approvedBy ?? null,
      notes: record.notes ?? null,
      createdAt,
      updatedAt: createdAt,
    });
    await tx.insert(claimHistoryTable).values({
      id: randomUUID(),
      claimId,
      fromStatus: null,
      toStatus: resolution.target,
      by: "migration-script",
      notes: historyNotes,
      timestamp: createdAt,
    });
    if (record.evidence?.length) {
      await tx.insert(claimEvidenceTable).values(
        record.evidence.map((evidence) => ({
          id: randomUUID(),
          claimId,
          kind: evidence.kind,
          reference: evidence.reference,
          note: evidence.note,
          createdBy: evidence.createdBy ?? "migration-script",
          createdAt,
        })),
      );
    }
  });

  report.migrated += 1;
}

async function main() {
  const args = process.argv.slice(2);
  const inputPath = readFlag(args, "--input");
  const commit = args.includes("--commit");

  if (!inputPath) {
    console.error("Usage: migrate-attend-claims -- --input <path-to-legacy-claims.json> [--commit]");
    process.exitCode = 1;
    return;
  }

  let records: LegacyClaimRecord[];
  try {
    const raw = readFileSync(inputPath, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("Input must be a JSON array of claim records");
    records = parsed as LegacyClaimRecord[];
  } catch (error) {
    console.error(`Failed to read input file: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Loaded ${records.length} legacy claim record(s) from ${inputPath}.`);
  console.log(commit ? "Running with --commit: rows will be written." : "Dry run: no rows will be written (pass --commit to apply).");

  const report: MigrationReport = {
    migrated: 0,
    alreadyMigrated: [],
    skippedInvalidRecord: [],
    skippedUnmatchedAccount: [],
    skippedUnmatchedItem: [],
    skippedUnknownStatus: [],
    lowConfidenceMappings: [],
  };

  for (const record of records) {
    await migrateRecord(record, commit, report);
  }

  printReport(report, commit);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void pool.end();
  });
