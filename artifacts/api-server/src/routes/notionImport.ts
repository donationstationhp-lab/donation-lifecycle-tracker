import { Router, type IRouter } from "express";
import { and, eq, inArray, or } from "drizzle-orm";
import { db, itemIdentitiesTable, itemExternalReferencesTable, itemIdentityAliasesTable, notionItemSnapshotsTable } from "@workspace/db";
import { requireStaff, requireSupervisor } from "../middlewares/apiKeyAuth";
import { readAllNotionItems } from "../lib/notionItemReader";
import { importNotionIdentities, notionBacktestReport, runImportedSnowRules } from "../lib/notionIdentityImport";

const router: IRouter = Router();
router.use(requireStaff);
router.get("/notion-import/report", async (_req, res) => {
  res.set("Cache-Control", "private, no-store");
  res.json(await notionBacktestReport());
});

router.post("/notion-import", requireSupervisor, async (_req, res) => {
  if (res.locals.authMethod !== "clerk" || !res.locals.staffUserId) {
    res.status(403).json({ error: "A named supervisor must explicitly authorize historical Notion import" }); return;
  }
  const pages = await readAllNotionItems(); // fully read before first local write
  res.json(await importNotionIdentities(pages));
});

router.post("/snow/rules-v1/run", async (_req, res) => {
  if (res.locals.authMethod !== "clerk" || !res.locals.staffUserId) {
    res.status(403).json({ error: "Sign in as named staff to run proposals" }); return;
  }
  res.json(await runImportedSnowRules());
});

router.post("/snow/rules-v2/run", async (_req, res) => {
  if (res.locals.authMethod !== "clerk" || !res.locals.staffUserId) {
    res.status(403).json({ error: "Named staff sign-in required" }); return;
  }
  res.json(await runImportedSnowRules("rules-v2"));
});

router.get("/item-identities/lookup", async (req, res) => {
  const key = typeof req.query.key === "string" ? req.query.key : "";
  if (!key || key.length > 500) { res.status(400).json({ error: "An exact item ID, identity UUID, or Notion page UUID is required" }); return; }
  const direct = await db.select().from(itemIdentitiesTable)
    .where(or(eq(itemIdentitiesTable.id, key), eq(itemIdentitiesTable.displayId, key)));
  const references = await db.select().from(itemExternalReferencesTable)
    .where(and(eq(itemExternalReferencesTable.provider, "notion"), eq(itemExternalReferencesTable.externalId, key)));
  const snapshots = await db.select({ identityId: notionItemSnapshotsTable.identityId })
    .from(notionItemSnapshotsTable).where(eq(notionItemSnapshotsTable.sourceItemId, key));
  const aliases = await db.select({ identityId: itemIdentityAliasesTable.identityId })
    .from(itemIdentityAliasesTable).where(eq(itemIdentityAliasesTable.alias, key));
  const ids = [...new Set([...direct.map((i) => i.id), ...references.map((r) => r.identityId),
    ...snapshots.map((s) => s.identityId), ...aliases.map((a) => a.identityId)])];
  if (!ids.length) { res.status(404).json({ error: "Identity not found" }); return; }
  const identities = await db.select().from(itemIdentitiesTable).where(inArray(itemIdentitiesTable.id, ids));
  res.status(ids.length > 1 ? 409 : 200).json({ ambiguous: ids.length > 1, identities });
});

export default router;
