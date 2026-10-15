import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, itemIdentitiesTable, itemExternalReferencesTable, donationItemsTable } from "@workspace/db";

export type IdentityTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export function idLineage(id: string | null) {
  if (id && /^DS-[0-9]+$/.test(id)) return "DS";
  if (id && /^DS-L-[0-9]+$/.test(id)) return "DS-L";
  return "unidentified";
}

export async function ensureAppItemIdentity(
  tx: Pick<typeof db, "insert" | "select">,
  item: { id: string; itemId: string; name: string },
) {
  await tx.insert(itemIdentitiesTable).values({
    id: item.id, displayId: item.itemId, name: item.name, lineage: idLineage(item.itemId),
  }).onConflictDoNothing();
  const [identity] = await tx.select().from(itemIdentitiesTable).where(eq(itemIdentitiesTable.id, item.id));
  if (!identity || identity.displayId !== item.itemId) {
    throw new Error("Item identity conflicts with an existing reserved identifier");
  }
}

export async function backfillAppIdentities(tx: IdentityTransaction) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('notion-item-identity-import'))`);
  const items = await tx.select({
    id: donationItemsTable.id, itemId: donationItemsTable.itemId, name: donationItemsTable.name,
  }).from(donationItemsTable);
  for (const item of items) await ensureAppItemIdentity(tx, item);
}

export async function attachNotionReference(tx: IdentityTransaction, identityId: string, pageId: string, url: string) {
  await tx.insert(itemExternalReferencesTable).values({
    id: randomUUID(), identityId, provider: "notion", externalId: pageId, url,
  });
}
