import "dotenv/config";
import { randomUUID } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import { db, pool, itemIdentitiesTable, notionItemSnapshotsTable, itemSnowTable,
  itemSnowHistoryTable, itemTierConfirmationsTable, itemSnowBacktestsTable } from "@workspace/db";
import { initializeStartupSecrets } from "../lib/startupSecrets";
import { readAllNotionItems, propertyText } from "../lib/notionItemReader";
import { foodFacts, proposeSnowRulesV1 } from "../lib/snowRulesV1";
import { runImportedSnowRules, notionBacktestReport } from "../lib/notionIdentityImport";

const ids = ["DS-0001", "DS-0002", "DS-0003", "DS-0004", "DS-0005", "DS-L-0016"];

async function acceptedFingerprint() {
  return JSON.stringify({
    values: await db.select({
      id: itemSnowTable.itemId, tier: itemSnowTable.acceptedTier, by: itemSnowTable.acceptedBy,
      at: itemSnowTable.acceptedAt, decision: itemSnowTable.acceptedDecision, source: itemSnowTable.acceptedSource,
    }).from(itemSnowTable).where(sql`${itemSnowTable.acceptedTier} IS NOT NULL`).orderBy(asc(itemSnowTable.itemId)),
    history: await db.select().from(itemSnowHistoryTable).orderBy(asc(itemSnowHistoryTable.id)),
  });
}

async function main() {
  if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT === "1") {
    throw new Error("Development-only maintenance");
  }
  await initializeStartupSecrets();
  const pages = await readAllNotionItems(); // Notion query only; never write.
  const salad = pages.filter((p) => propertyText(p.properties["Item ID"]) === "DS-L-0004");
  if (salad.length !== 1) throw new Error("Catering item missing or ambiguous");
  const originFields = Object.fromEntries(Object.entries(salad[0].properties)
    .filter(([key]) => /source|origin|donor|donat/i.test(key))
    .map(([key, value]) => [key, propertyText(value)]));
  console.log(JSON.stringify({ cateringEvidence: originFields, propertyNames: Object.keys(salad[0].properties) }));
  if (!process.argv.includes("--apply")) return;
  const origin = Object.values(originFields).filter(Boolean).join("; ");
  if (!/\bBoka\b.*\bCatering\b/i.test(origin)) {
    throw new Error("Boka Catering source not verified; stop before changing Development data");
  }
  const before = await acceptedFingerprint();
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('notion-item-identity-import'))`);
    const snapshots = await tx.select().from(notionItemSnapshotsTable);
    // Capture the original v1 comparison including abstentions before enriching
    // source evidence or replacing any active proposal.
    const [alreadyCaptured] = await tx.select().from(itemSnowBacktestsTable)
      .where(eq(itemSnowBacktestsTable.version, "rules-v1"));
    if (!alreadyCaptured) for (const snapshot of snapshots) {
      const p = proposeSnowRulesV1(foodFacts(snapshot));
      await tx.insert(itemSnowBacktestsTable).values({
        id: randomUUID(), itemId: snapshot.identityId, version: "rules-v1",
        input: snapshot, proposal: p?.tier ?? null, rationale: p?.rationale ?? "No proposal: insufficient facts or non-food.",
      });
    }
    for (const sourceId of ids) {
      const matches = snapshots.filter((s) => s.sourceItemId === sourceId);
      if (matches.length !== 1) throw new Error("T.I.E.R. identity missing or ambiguous");
      const snapshot = matches[0];
      const [prior] = await tx.select().from(itemTierConfirmationsTable)
        .where(eq(itemTierConfirmationsTable.itemId, snapshot.identityId));
      if (prior && (prior.tier !== "R" || prior.confirmedBy !== "DeWayne" || prior.confirmedOn !== "2026-10-16")) {
        throw new Error("Conflicting staff T.I.E.R. confirmation");
      }
      await tx.insert(itemTierConfirmationsTable).values({
        itemId: snapshot.identityId, tier: "R", confirmedBy: "DeWayne", confirmedOn: "2026-10-16",
        reason: "Resources — explicitly confirmed by staff; T.I.E.R. only, not S.N.O.W.",
      }).onConflictDoNothing();
      const [identity] = await tx.select().from(itemIdentitiesTable).where(eq(itemIdentitiesTable.id, snapshot.identityId));
      const flags = identity.reviewFlags.filter((f) => f !== "T.I.E.R. not recorded in Notion");
      await tx.update(itemIdentitiesTable).set({ reviewFlags: flags, needsReview: flags.length > 0 })
        .where(eq(itemIdentitiesTable.id, snapshot.identityId));
    }
    const matchingSalad = snapshots.filter((s) => s.notionPageId === salad[0].id && s.sourceItemId === "DS-L-0004");
    if (matchingSalad.length !== 1) throw new Error("Catering page identity mismatch");
    await tx.update(notionItemSnapshotsTable).set({ source: origin })
      .where(eq(notionItemSnapshotsTable.identityId, matchingSalad[0].identityId));
  });
  const run = await runImportedSnowRules("rules-v2");
  if (await acceptedFingerprint() !== before) throw new Error("Accepted S.N.O.W. fingerprint changed");
  const report = await notionBacktestReport();
  console.log(JSON.stringify({
    run, acceptedAndHistoryUnchanged: true, summary: report.summary,
    confirmed: report.items.filter((i) => ids.includes(i.id ?? "")).map((i) => ({ id: i.id, tier: i.tier, confirmation: i.tierConfirmation })),
    comparisons: report.items.map((i) => ({
      id: i.id, name: i.name, accepted: i.acceptedFromNotion, v1: i.proposalV1, v2: i.proposal, comparison: i.comparison,
    })),
  }, null, 2));
}
main().catch((error: unknown) => {
  console.error(error instanceof Error && /missing|ambiguous|verified|Conflicting|mismatch|fingerprint|Development-only/.test(error.message)
    ? error.message : "Development maintenance failed; no Notion writes or ATTEND replay attempted.");
  process.exitCode = 1;
}).finally(() => pool.end());
