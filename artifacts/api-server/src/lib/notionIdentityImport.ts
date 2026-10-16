import { randomUUID } from "node:crypto";
import { eq, sql, asc } from "drizzle-orm";
import { db, itemIdentitiesTable, itemExternalReferencesTable, itemIdentityAliasesTable, notionItemSnapshotsTable,
  itemSnowTable, itemSnowHistoryTable, itemTierConfirmationsTable, itemSnowBacktestsTable } from "@workspace/db";
import { propertyText, type NotionItemPage } from "./notionItemReader";
import { attachNotionReference, backfillAppIdentities, idLineage } from "./itemIdentity";
import { lockItemDsCounter, reconcileItemDsCounter } from "./itemIds";
import { applySnowRules } from "./snowRuleProposer";
import { foodFacts, proposeSnowRulesV1, SNOW_RULES_VERSION } from "./snowRulesV1";
import { proposeSnowRulesV2, SNOW_RULES_V2_VERSION } from "./snowRulesV2";

export function parseNotionItem(page: NotionItemPage) {
  const text = (key: string) => propertyText(page.properties[key]);
  const snow = text("S.N.O.W. Category Tier");
  const rawTier = text("T.I.E.R.");
  const tier = rawTier ? /^[TIER](?:\s*[—–-]\s*.+)?$/.test(rawTier) ? rawTier[0] : rawTier : null;
  const flags: string[] = [];
  const sourceItemId = text("Item ID") || null;
  if (!sourceItemId) flags.push("Missing item ID — no ID assigned");
  else if (idLineage(sourceItemId) === "unidentified") flags.push("Non-DS ID — preserved exactly");
  if (!tier) flags.push("T.I.E.R. not recorded in Notion");
  else if (!["T", "I", "E", "R"].includes(tier)) flags.push("Unrecognized T.I.E.R. — preserved for review");
  if (!text("Name")) flags.push("Name not recorded in Notion");
  if (snow && !["URGENT", "STABLE", "SURPLUS"].includes(snow)) {
    flags.push("Unrecognized Notion S.N.O.W. value — not accepted");
  }
  return {
    sourceItemId, name: text("Name"), category: text("Category"),
    tier, condition: text("Condition") || null, stage: text("Stage") || null,
    receivedDate: text("Date Received") || null, expiryDate: text("Expiry Date") || null,
    notes: text("Notes"), source: text("Source") || text("Origin") || null,
    donor: text("Donor") || text("Donated By") || null,
    acceptedTierFromNotion: snow || null, flags,
  };
}

/**
 * Explicitly authorized historical import, NOT an automated acceptance path.
 * Only an empty accepted layer can be initialized from the staff decision
 * already present in Notion. All subsequent local staff decisions are retained.
 * Entire batch commits atomically, after every Notion page has been read.
 */
export async function importNotionIdentities(pages: NotionItemPage[]) {
  const uniquePages = new Set<string>();
  const counts = new Map<string, number>();
  for (const page of pages) {
    if (uniquePages.has(page.id)) throw new Error("Duplicate Notion page in import input");
    uniquePages.add(page.id);
    const id = parseNotionItem(page).sourceItemId;
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    if (!Number.isFinite(new Date(page.last_edited_time).getTime())) throw new Error("Invalid Notion modification timestamp");
  }
  return db.transaction(async (tx) => {
    // Same order as every intake/importer: DS counter, then identities.
    await lockItemDsCounter(tx);
    await backfillAppIdentities(tx);
    let created = 0, matched = 0, acceptedImported = 0;
    const seenIds = new Set<string>();
    for (const page of pages) {
      const parsed = parseNotionItem(page);
      const { flags, ...snapshot } = parsed;
      const [reference] = await tx.select().from(itemExternalReferencesTable)
        .where(sql`${itemExternalReferencesTable.provider} = 'notion' AND ${itemExternalReferencesTable.externalId} = ${page.id}`);
      let identityId = reference?.identityId;
      let firstImport = false;
      if (!identityId) {
        const [collision] = parsed.sourceItemId ? await tx.select().from(itemIdentitiesTable)
          .where(eq(itemIdentitiesTable.displayId, parsed.sourceItemId)) : [];
        const duplicate = !!parsed.sourceItemId && (counts.get(parsed.sourceItemId) ?? 0) > 1;
        if (duplicate) flags.push("Duplicate Notion item ID — isolated; no automatic merge");
        if (collision && !duplicate) flags.push("ID already reserved by another identity — no automatic merge");
        identityId = randomUUID();
        await tx.insert(itemIdentitiesTable).values({
          id: identityId, displayId: duplicate || collision ? null : parsed.sourceItemId,
          lineage: idLineage(parsed.sourceItemId), name: parsed.name,
          needsReview: flags.length > 0, reviewFlags: flags,
        });
        await attachNotionReference(tx, identityId, page.id, page.url);
        created++; firstImport = true;
      } else {
        matched++;
        const [prior] = await tx.select().from(notionItemSnapshotsTable)
          .where(eq(notionItemSnapshotsTable.identityId, identityId));
        if (prior && prior.notionEditedAt > new Date(page.last_edited_time)) {
          seenIds.add(identityId); continue;
        }
        const [identity] = await tx.select().from(itemIdentitiesTable)
          .where(eq(itemIdentitiesTable.id, identityId)).for("update");
        if (!identity) throw new Error("Notion external reference has no identity");
        if (prior && prior.sourceItemId !== parsed.sourceItemId) {
          flags.push("Notion ID changed since first import — original identity not renamed");
        }
        if (parsed.sourceItemId && (counts.get(parsed.sourceItemId) ?? 0) > 1) flags.push("Duplicate Notion item ID — no automatic merge");
        const preservedFlags = identity.reviewFlags.filter((flag) =>
          /already reserved|isolated|changed since/.test(flag));
        await tx.update(itemIdentitiesTable).set({
          name: parsed.name, needsReview: flags.length + preservedFlags.length > 0,
          reviewFlags: [...new Set([...flags, ...preservedFlags])],
        }).where(eq(itemIdentitiesTable.id, identityId));
      }
      seenIds.add(identityId);
      const [confirmation] = await tx.select().from(itemTierConfirmationsTable)
        .where(eq(itemTierConfirmationsTable.itemId, identityId));
      if (confirmation) {
        const [identity] = await tx.select().from(itemIdentitiesTable).where(eq(itemIdentitiesTable.id, identityId));
        const remaining = identity.reviewFlags.filter((flag) => flag !== "T.I.E.R. not recorded in Notion");
        await tx.update(itemIdentitiesTable).set({ reviewFlags: remaining, needsReview: remaining.length > 0 })
          .where(eq(itemIdentitiesTable.id, identityId));
      }
      if (parsed.sourceItemId) await tx.insert(itemIdentityAliasesTable).values({
        id: randomUUID(), identityId, alias: parsed.sourceItemId,
      }).onConflictDoNothing();
      await tx.insert(notionItemSnapshotsTable).values({
        ...snapshot, identityId, notionPageId: page.id,
        notionEditedAt: new Date(page.last_edited_time), importedAt: new Date(),
      }).onConflictDoUpdate({
        target: notionItemSnapshotsTable.identityId,
        set: { ...snapshot, notionEditedAt: new Date(page.last_edited_time), importedAt: new Date() },
      });
      const validSnow = snapshot.acceptedTierFromNotion;
      // Exactly-once first-import hydration. Reruns never mutate acceptance.
      if (firstImport && validSnow && ["URGENT", "STABLE", "SURPLUS"].includes(validSnow)) {
        const tier = validSnow as "URGENT" | "STABLE" | "SURPLUS";
        const now = new Date();
        await tx.insert(itemSnowTable).values({
          itemId: identityId, version: 1, acceptedTier: tier,
          acceptedBy: "Notion staff decision — original author not supplied",
          acceptedAt: now, acceptedDecision: "notion_import", acceptedSource: "Notion import",
        });
        await tx.insert(itemSnowHistoryTable).values({
          id: randomUUID(), itemId: identityId, version: 1, acceptedTier: tier,
          acceptedBy: "Notion staff decision — original author not supplied",
          acceptedAt: now, decision: "notion_import", source: "Notion import",
          reason: `Staff-recorded Notion decision imported from page ${page.id}; timestamp is import time.`,
        });
        acceptedImported++;
      }
    }
    const nextDsNumber = await reconcileItemDsCounter(tx);
    return { read: pages.length, created, matched, acceptedImported, nextDsNumber, identities: [...seenIds] };
  });
}

export async function runImportedSnowRules(version: "rules-v1" | "rules-v2" = SNOW_RULES_VERSION) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('notion-item-identity-import'))`);
    const snapshots = await tx.select().from(notionItemSnapshotsTable).orderBy(asc(notionItemSnapshotsTable.identityId));
    let proposed = 0;
    for (const snapshot of snapshots) {
      const proposal = await applySnowRules(tx, snapshot.identityId, snapshot, version);
      if (proposal) proposed++;
      await tx.insert(itemSnowBacktestsTable).values({
        id: randomUUID(), itemId: snapshot.identityId, version, input: snapshot,
        proposal: proposal?.tier ?? null,
        rationale: proposal?.rationale ?? "No rule: non-food or insufficient explicit food information.",
      });
    }
    return { evaluated: snapshots.length, proposed, abstained: snapshots.length - proposed, version };
  });
}

export async function notionBacktestReport() {
  const rows = await db.select({
    snapshot: notionItemSnapshotsTable, identity: itemIdentitiesTable,
    snow: itemSnowTable, confirmation: itemTierConfirmationsTable,
  }).from(notionItemSnapshotsTable)
    .innerJoin(itemIdentitiesTable, eq(itemIdentitiesTable.id, notionItemSnapshotsTable.identityId))
    .leftJoin(itemSnowTable, eq(itemSnowTable.itemId, itemIdentitiesTable.id))
    .leftJoin(itemTierConfirmationsTable, eq(itemTierConfirmationsTable.itemId, itemIdentitiesTable.id))
    .orderBy(asc(notionItemSnapshotsTable.sourceItemId));
  const items = rows.map(({ snapshot, identity, snow, confirmation }) => {
    const facts = foodFacts(snapshot);
    const proposalV1 = proposeSnowRulesV1(facts);
    const proposal = proposeSnowRulesV2(snapshot);
    const comparison = !proposal ? "no_proposal" : !snapshot.acceptedTierFromNotion ? "no_accepted"
      : snapshot.acceptedTierFromNotion === proposal.tier ? "agree" : "different";
    return {
      identityId: identity.id, id: snapshot.sourceItemId, displayId: identity.displayId,
      name: snapshot.name, category: snapshot.category, tier: confirmation?.tier ?? snapshot.tier,
      tierFromNotion: snapshot.tier,
      tierConfirmation: confirmation ? `${confirmation.confirmedBy}, ${confirmation.confirmedOn}: ${confirmation.reason}` : null,
      proposalV1: proposalV1?.tier ?? null,
      rationaleV1: proposalV1?.rationale ?? "No rule: non-food or insufficient explicit food information.",
      comparisonV1: !proposalV1 ? "no_proposal" : !snapshot.acceptedTierFromNotion ? "no_accepted"
        : snapshot.acceptedTierFromNotion === proposalV1.tier ? "agree" : "different",
      notionPageId: snapshot.notionPageId, acceptedFromNotion: snapshot.acceptedTierFromNotion,
      currentAccepted: snow?.acceptedTier ?? null, proposal: proposal?.tier ?? null,
      rationale: proposal?.rationale ?? "No rule: non-food or insufficient explicit food information.",
      comparison, needsReview: identity.needsReview, flags: identity.reviewFlags,
      notionEditedAt: snapshot.notionEditedAt.toISOString(), importedAt: snapshot.importedAt.toISOString(),
    };
  });
  return {
    version: SNOW_RULES_V2_VERSION, generatedAt: new Date().toISOString(), items,
    summary: {
      total: items.length, agree: items.filter((i) => i.comparison === "agree").length,
      different: items.filter((i) => i.comparison === "different").length,
      noProposal: items.filter((i) => i.comparison === "no_proposal").length,
      noAccepted: items.filter((i) => i.comparison === "no_accepted").length,
      needsReview: items.filter((i) => i.needsReview).length,
    },
  };
}
