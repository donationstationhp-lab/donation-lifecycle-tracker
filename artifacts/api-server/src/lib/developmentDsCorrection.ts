import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import {
  db, donationItemsTable, itemIdentitiesTable, itemIdentityAliasesTable,
  stageHistoryTable, trackingCountersTable, installDsNumberConstraints,
} from "@workspace/db";
import { highestCanonicalDsNumber, lockItemDsCounter, nextUnreservedDsNumber } from "./itemIds";

export const AUGUST_LEGACY_DS_IDS = [
  ...Array.from({ length: 10 }, (_, i) => `DS-${1001 + i}`),
  "DS-2558", "DS-2590", "DS-5038", "DS-6395",
] as const;
const NOTE = "Relabeled on Oct 16, 2026 because it predates the sequential pilot numbering. Original DS identifier retained as a permanent alias. Staff-authorized Development correction.";
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** One explicit Development correction, atomic and rerunnable; no ID allocation. */
export async function correctDevelopmentDsNumbers(tx: Transaction) {
  await lockItemDsCounter(tx);
  await tx.execute(sql`LOCK TABLE donation_items, item_identities, item_identity_aliases,
    notion_item_snapshots IN SHARE ROW EXCLUSIVE MODE`);
  const plan: Array<{ id: string; oldId: string; newId: string; stage: string; done: boolean }> = [];
  // Validate the whole batch before DDL, labels, reservations or history change.
  for (const oldId of AUGUST_LEGACY_DS_IDS) {
    const newId = oldId.replace("DS-", "DS-L-");
    const rows = await tx.execute<{ id: string; item_id: string; stage: string; august: boolean }>(sql`
      SELECT id,item_id,stage,created_at >= '2026-08-01'::timestamptz
        AND created_at < '2026-09-01'::timestamptz AS august
      FROM donation_items WHERE item_id IN (${oldId},${newId}) FOR UPDATE
    `);
    if (rows.rows.length !== 1 || !rows.rows[0].august)
      throw new Error(`Cannot identify exactly one August record for ${oldId}; no changes committed.`);
    const row = rows.rows[0];
    const [identity] = await tx.select().from(itemIdentitiesTable).where(eq(itemIdentitiesTable.id, row.id));
    if (!identity || identity.displayId !== row.item_id)
      throw new Error(`Identity linkage conflict for ${oldId}; no changes committed.`);
    const conflicts = await tx.execute<{ n: string }>(sql`
      SELECT count(*)::text AS n FROM (
        SELECT id AS owner,item_id AS label FROM donation_items
        UNION ALL SELECT id,display_id FROM item_identities
        UNION ALL SELECT identity_id,alias FROM item_identity_aliases
        UNION ALL SELECT identity_id,source_item_id FROM notion_item_snapshots
      ) labels WHERE label IN (${newId},${oldId}) AND owner <> ${row.id}
    `);
    if (conflicts.rows[0].n !== "0") throw new Error(`Identifier collision for ${oldId} / ${newId}; no changes committed.`);
    if (row.item_id === newId) {
      const [alias] = await tx.select().from(itemIdentityAliasesTable)
        .where(sql`${itemIdentityAliasesTable.identityId}=${row.id} AND ${itemIdentityAliasesTable.alias}=${oldId}`);
      if (!alias) throw new Error(`Previously relabeled record ${newId} lacks its permanent alias.`);
    } else {
      // Even a same-owner target alias is a collision on the first run.
      const target = await tx.execute<{ n: string }>(sql`
        SELECT count(*)::text AS n FROM (
          SELECT alias AS label FROM item_identity_aliases
          UNION ALL SELECT source_item_id FROM notion_item_snapshots
        ) labels WHERE label=${newId}
      `);
      if (target.rows[0].n !== "0") throw new Error(`Target ${newId} already exists; no changes committed.`);
    }
    plan.push({ id: row.id, oldId, newId, stage: row.stage, done: row.item_id === newId });
  }
  if (plan.some(p => p.done) && plan.some(p => !p.done))
    throw new Error("Partially relabeled batch needs review; no changes committed.");
  await installDsNumberConstraints(tx);
  // Canonical owners first, aliases/snapshots second. Numeric collisions abort.
  await tx.execute(sql`UPDATE donation_items SET item_id=item_id`);
  await tx.execute(sql`UPDATE item_identities SET display_id=display_id`);
  await tx.execute(sql`UPDATE item_identity_aliases SET alias=alias`);
  await tx.execute(sql`UPDATE notion_item_snapshots SET source_item_id=source_item_id`);
  for (const p of plan.filter(p => !p.done)) {
    await tx.update(donationItemsTable).set({ itemId: p.newId }).where(eq(donationItemsTable.id, p.id));
    await tx.update(itemIdentitiesTable).set({ displayId: p.newId, lineage: "DS-L" }).where(eq(itemIdentitiesTable.id, p.id));
    await tx.insert(itemIdentityAliasesTable).values({ id: randomUUID(), identityId: p.id, alias: p.oldId }).onConflictDoNothing();
    await tx.insert(stageHistoryTable).values({
      id: randomUUID(), itemId: p.id, fromStage: p.stage, toStage: p.stage,
      notes: `${NOTE} ${p.oldId} → ${p.newId}`,
    });
  }
  const highest = await highestCanonicalDsNumber(tx);
  // Lowering is authorized ONCE for the complete original batch, never on rerun.
  const previous = await lockItemDsCounter(tx);
  const start = plan.every(p => p.done) && previous > highest + 1n ? previous : highest + 1n;
  const next = await nextUnreservedDsNumber(tx, start);
  await tx.update(trackingCountersTable).set({ nextNumber: next.toString() })
    .where(eq(trackingCountersTable.name, "item_ds"));
  return { relabeled: plan.filter(p => !p.done).length, labels: plan.map(p => `${p.oldId} → ${p.newId}`), highestCanonical: highest.toString(), nextDsNumber: next.toString() };
}
