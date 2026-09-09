import { readFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import {
  claimEvidenceTable,
  claimHistoryTable,
  claimsTable,
  db,
  donationItemsTable,
  recipientAccountsTable,
} from "@workspace/db";
import { eq, ilike } from "drizzle-orm";
import { z } from "zod";

const attendEntrySchema = z.object({
  id: z.number(),
  claimDescription: z.string(),
  status: z.enum(["pending", "blocked", "verified"]),
  artifactReference: z.string().nullable(),
  accountId: z.string().nullable(),
  linkedTransferId: z.string().nullable(),
  linkedItemId: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).strict();

const attendExportSchema = z.array(attendEntrySchema);

type AttendEntry = z.infer<typeof attendEntrySchema>;
type AttendStatus = AttendEntry["status"];
type ClaimStatus = "submitted" | "approved" | "rejected";

interface ReportItem {
  entryId: number;
  reason: string;
}

interface MigrationReport {
  totalSourceCount: number;
  migratedCount: number;
  noAccountId: ReportItem[];
  unmatchedAccount: ReportItem[];
  noLinkedItemId: ReportItem[];
  unmatchedItem: ReportItem[];
  lowConfidence: ReportItem[];
}

const statusMapping: Record<AttendStatus, ClaimStatus> = {
  pending: "submitted",
  verified: "approved",
  blocked: "rejected",
};

function generateTrackingCode(): string {
  return `DS-${randomBytes(8).toString("hex").toUpperCase()}`;
}

function escapeIlikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function buildClaimNotes(entry: AttendEntry): string {
  const parts = [
    `Migrated from ATTEND entry #${entry.id} (original status: ${entry.status}).`,
    entry.claimDescription,
  ];

  if (entry.notes?.trim()) {
    parts.push(entry.notes);
  }

  if (entry.linkedTransferId?.trim()) {
    parts.push(
      `Original linkedTransferId (not resolved, not migrated as a transfer): ${entry.linkedTransferId}`,
    );
  }

  return parts.join("\n\n");
}

function printItems(label: string, items: ReportItem[]): void {
  console.log(`${label}: ${items.length}`);
  for (const item of items) {
    console.log(`  - ATTEND entry #${item.entryId}: ${item.reason}`);
  }
}

function printReport(report: MigrationReport, commit: boolean): void {
  console.log("\nATTEND claims migration report");
  console.log(`Mode: ${commit ? "commit" : "dry-run"}`);
  console.log(`Total source count: ${report.totalSourceCount}`);
  console.log(
    `${commit ? "Migrated" : "Would migrate"} count: ${report.migratedCount}`,
  );
  printItems("No accountId skips", report.noAccountId);
  printItems("Unmatched account skips", report.unmatchedAccount);
  printItems("No linkedItemId skips", report.noLinkedItemId);
  printItems("Unmatched item skips", report.unmatchedItem);
  printItems("Low-confidence mappings", report.lowConfidence);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const inputPath = args[0];
  const commit = args.includes("--commit");

  if (!inputPath || inputPath === "--commit") {
    throw new Error(
      "Usage: pnpm --filter @workspace/scripts migrate-attend-claims <export.json> [--commit]",
    );
  }

  const source = await readFile(inputPath, "utf8");
  const parsedJson: unknown = JSON.parse(source);
  const entries = attendExportSchema.parse(parsedJson);

  const report: MigrationReport = {
    totalSourceCount: entries.length,
    migratedCount: 0,
    noAccountId: [],
    unmatchedAccount: [],
    noLinkedItemId: [],
    unmatchedItem: [],
    lowConfidence: [],
  };

  for (const entry of entries) {
    const mappedStatus = statusMapping[entry.status];

    if (entry.status === "blocked") {
      report.lowConfidence.push({
        entryId: entry.id,
        reason: "blocked -> rejected",
      });
    }

    if (!entry.accountId?.trim()) {
      report.noAccountId.push({
        entryId: entry.id,
        reason: "accountId is missing or empty",
      });
      continue;
    }

    const [account] = await db
      .select({ id: recipientAccountsTable.id })
      .from(recipientAccountsTable)
      .where(
        ilike(
          recipientAccountsTable.name,
          escapeIlikePattern(entry.accountId),
        ),
      )
      .limit(1);

    if (!account) {
      report.unmatchedAccount.push({
        entryId: entry.id,
        reason: `no recipient account exactly matched "${entry.accountId}" (case-insensitive)`,
      });
      continue;
    }

    if (!entry.linkedItemId?.trim()) {
      report.noLinkedItemId.push({
        entryId: entry.id,
        reason: "linkedItemId is missing or empty",
      });
      continue;
    }

    const [item] = await db
      .select({ id: donationItemsTable.id })
      .from(donationItemsTable)
      .where(eq(donationItemsTable.itemId, entry.linkedItemId))
      .limit(1);

    if (!item) {
      report.unmatchedItem.push({
        entryId: entry.id,
        reason: `no donation item exactly matched itemId "${entry.linkedItemId}"`,
      });
      continue;
    }

    report.migratedCount += 1;

    if (!commit) {
      continue;
    }

    await db.transaction(async (tx) => {
      const claimId = randomUUID();

      await tx.insert(claimsTable).values({
        id: claimId,
        trackingCode: generateTrackingCode(),
        accountId: account.id,
        itemId: item.id,
        status: mappedStatus,
        submittedBy: "attend-migration",
        approvedBy: mappedStatus === "approved" ? "attend-migration" : null,
        notes: buildClaimNotes(entry),
      });

      await tx.insert(claimHistoryTable).values({
        id: randomUUID(),
        claimId,
        fromStatus: null,
        toStatus: mappedStatus,
        by: "attend-migration",
        notes: `Migrated from ATTEND entry #${entry.id}`,
      });

      if (mappedStatus === "approved" && entry.artifactReference?.trim()) {
        await tx.insert(claimEvidenceTable).values({
          id: randomUUID(),
          claimId,
          kind: "identity",
          reference: entry.artifactReference,
          createdBy: "attend-migration",
          note: "Migrated from ATTEND — source system recorded a single undifferentiated artifact reference, not categorized evidence. Eligibility and need evidence were never collected in ATTEND and are NOT fabricated here; they are genuinely missing.",
        });
      }
    });
  }

  printReport(report, commit);
}

main().catch((error: unknown) => {
  if (error instanceof z.ZodError) {
    console.error("Invalid ATTEND export:");
    console.error(error.message);
  } else {
    console.error(error instanceof Error ? error.message : error);
  }
  process.exitCode = 1;
});