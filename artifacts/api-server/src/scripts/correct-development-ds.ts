import { db, pool, prepareDevelopmentDsSchema } from "@workspace/db";
import { correctDevelopmentDsNumbers } from "../lib/developmentDsCorrection";
import { sql } from "drizzle-orm";

async function main() {
  if (process.env.NODE_ENV !== "development" || process.env.REPLIT_DEPLOYMENT === "1")
    throw new Error("This correction is permitted only in the Development workspace.");
  if (!process.argv.includes("--confirm-development"))
    throw new Error("Explicit --confirm-development is required.");
  // Workspace metadata may say "production" even for a Development connection.
  // Require independent attestation from executeSql(environment: development),
  // never trust NODE_ENV alone or override a deployment guard.
  const expected = process.argv.find(arg => arg.startsWith("--development-fingerprint="))?.split("=")[1];
  if (!expected || !/^[a-f0-9]{32}$/.test(expected)) throw new Error("A fresh Development-only connection fingerprint is required.");
  const actual = await db.execute<{ fingerprint: string }>(sql`
    SELECT md5(coalesce(string_agg(id,',' ORDER BY id),'')) AS fingerprint FROM donation_items
  `);
  if (actual.rows[0]?.fingerprint !== expected) throw new Error("Database does not match the independently verified Development snapshot.");
  console.log(JSON.stringify(await db.transaction(async tx => {
    await prepareDevelopmentDsSchema(tx);
    if (process.argv.includes("--prepare-schema-only")) return { schemaPrepared: true, dataChanged: false };
    return correctDevelopmentDsNumbers(tx);
  }), null, 2));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Correction failed"); process.exitCode = 1; })
  .finally(() => pool.end());
