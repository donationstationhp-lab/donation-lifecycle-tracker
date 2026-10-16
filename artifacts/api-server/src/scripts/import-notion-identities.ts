import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { db, pool, itemExternalReferencesTable, itemIdentityAliasesTable } from "@workspace/db";
import { initializeStartupSecrets } from "../lib/startupSecrets";
import { readAllNotionItems, propertyText } from "../lib/notionItemReader";
import { importNotionIdentities, runImportedSnowRules, notionBacktestReport } from "../lib/notionIdentityImport";

async function main() {
  if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT === "1") {
    throw new Error("This maintenance command is Development-only; production changes need separate authorization");
  }
  await initializeStartupSecrets();
  const pages = await readAllNotionItems();
  if (!process.argv.includes("--apply")) {
    console.log(JSON.stringify({
      dryRun: true, read: pages.length,
      ids: pages.map((page) => propertyText(page.properties["Item ID"]) || null),
    }, null, 2));
    return;
  }
  const imported = await importNotionIdentities(pages);
  // Hard verification gate before proposals. Every source page and nonempty
  // exact source ID must resolve to the same durable identity via its alias.
  for (const page of pages) {
    const refs = await db.select().from(itemExternalReferencesTable).where(and(
      eq(itemExternalReferencesTable.provider, "notion"), eq(itemExternalReferencesTable.externalId, page.id),
    ));
    if (refs.length !== 1) throw new Error("Page-to-identity verification failed; proposals were not run");
    const sourceId = propertyText(page.properties["Item ID"]);
    if (sourceId) {
      const aliases = await db.select().from(itemIdentityAliasesTable).where(and(
        eq(itemIdentityAliasesTable.identityId, refs[0].identityId), eq(itemIdentityAliasesTable.alias, sourceId),
      ));
      if (aliases.length !== 1) throw new Error("Exact item-ID lookup verification failed; proposals were not run");
    }
  }
  console.log(JSON.stringify({ imported, identityLookupsVerified: true }, null, 2));
  if (process.argv.includes("--propose")) {
    const proposals = await runImportedSnowRules("rules-v2");
    const report = await notionBacktestReport();
    console.log(JSON.stringify({
      proposals, summary: report.summary,
      comparisons: report.items.filter((item) => item.proposal).map((item) => ({
        id: item.id, acceptedFromNotion: item.acceptedFromNotion,
        proposed: item.proposal, comparison: item.comparison, rationale: item.rationale,
      })),
      review: report.items.filter((item) => item.needsReview).map((item) => ({ id: item.id, flags: item.flags })),
    }, null, 2));
  }
}

main().catch((error: unknown) => {
  // Do not log raw provider/database errors or connection objects.
  console.error(error instanceof Error && /verification failed|Development-only/.test(error.message)
    ? error.message : "Notion import failed. No Notion writes were attempted; inspect bounded server diagnostics.");
  process.exitCode = 1;
}).finally(() => pool.end());
