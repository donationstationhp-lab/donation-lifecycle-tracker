/**
 * Private, full Development-only snapshot. No application/Production writes.
 * Restore verification uses a disposable schema on the attested Development DB.
 * Connection settings are inherited privately, never logged or put in argv/files.
 */
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, chmod, rm } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { createInspectionClient } from "@workspace/db/inspection";

const root = resolve(import.meta.dirname, "../..");
const output = resolve(root, "generated-artifacts/account-move-2026-10-17");
const expectedFingerprint = process.argv.find(a => a.startsWith("--development-fingerprint="))?.split("=")[1];
let phase = "Development connection attestation";
class SafeBackupError extends Error {}
const legacy = [...Array.from({ length: 10 }, (_, n) => String(1001 + n)), "2558", "2590", "5038", "6395"];
const quote = (name: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error("Unexpected database identifier");
  return `"${name}"`;
};
function run(command: string, args: string[], readOnly = false): Promise<void> {
  return new Promise((done, reject) => {
    const connection = new URL(process.env.DATABASE_URL!);
    const child = spawn(command, args, {
      env: { ...process.env, PGHOST: connection.hostname, PGPORT: connection.port || "5432",
        PGDATABASE: decodeURIComponent(connection.pathname.slice(1)),
        PGUSER: decodeURIComponent(connection.username), PGPASSWORD: decodeURIComponent(connection.password),
        PGSSLMODE: connection.searchParams.get("sslmode") || "prefer",
        PGOPTIONS: readOnly ? "-c default_transaction_read_only=on" : "" },
      stdio: ["ignore", "ignore", "pipe"],
    });
    // Never expose tool errors: they can contain database names or row contents.
    let diagnostics = "";
    child.stderr.on("data", chunk => { diagnostics += String(chunk); });
    child.on("error", () => reject(new Error(`${command} could not start; details withheld`)));
    child.on("close", code => {
      if (code === 0) return done();
      const reason = /server version mismatch/.test(diagnostics) ? "PostgreSQL client/server version mismatch"
        : /permission denied/.test(diagnostics) ? "insufficient permissions"
        : /invalid snapshot/.test(diagnostics) ? "snapshot unavailable"
        : /does not exist/.test(diagnostics) ? "required object missing"
        : "diagnostics withheld";
      reject(new SafeBackupError(`${command} failed (exit ${code}): ${reason}`));
    });
  });
}
async function main() {
  if (process.env.REPLIT_DEPLOYMENT === "1" || process.env.NODE_ENV !== "development"
    || !expectedFingerprint || !/^[a-f0-9]{32}$/.test(expectedFingerprint)
    || !process.argv.includes("--confirm-development")) throw new Error("Development attestation and explicit confirmation required");
  if (!process.env.DATABASE_URL) throw new Error("Development database connection is unavailable");
  const client = createInspectionClient(process.env.DATABASE_URL);
  const scratch = `move_verify_${randomUUID().replaceAll("-", "")}`;
  let scratchMayExist = false;
  try {
    await client.connect();
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const fingerprint = await client.query("SELECT md5(coalesce(string_agg(id,',' ORDER BY id),'')) AS fingerprint FROM public.donation_items");
    if (fingerprint.rows[0]?.fingerprint !== expectedFingerprint) throw new Error("Connection does not match independently attested Development database");
    const snapshot = await client.query("SELECT pg_export_snapshot() AS snapshot");
    const snapshotId = String(snapshot.rows[0]?.snapshot);
    if (!/^[A-Fa-f0-9-]+$/.test(snapshotId)) throw new Error("Invalid snapshot identifier");
    const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"))
      .rows.map(row => String(row.tablename));
    const namespaces = await client.query("SELECT count(*)::int AS other FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('public','information_schema')");
    if (Number(namespaces.rows[0]?.other) !== 0) throw new Error("Unexpected non-public schemas need explicit export review");
    const summaries: Record<string, { rows: number; fingerprint: string }> = {};
    for (const table of tables) {
      const result = await client.query(`SELECT count(*)::int AS rows,
        md5(coalesce(string_agg(to_jsonb(t)::text,',' ORDER BY to_jsonb(t)::text),'')) AS fingerprint
        FROM public.${quote(table)} t`);
      summaries[table] = { rows: Number(result.rows[0]?.rows), fingerprint: String(result.rows[0]?.fingerprint) };
    }
    const counter = await client.query("SELECT next_number::text AS next_number FROM public.tracking_counters WHERE name='item_ds'");
    if (counter.rows[0]?.next_number !== "6") throw new Error("Counter is no longer 6; stop rather than reset or mislabel backup");
    const security = await client.query("SELECT (SELECT count(*) FROM public.tracking_otps)::int AS otps,(SELECT count(*) FROM public.notification_outbox WHERE processing_lease_token IS NOT NULL)::int AS leases");
    if (Number(security.rows[0]?.otps) || Number(security.rows[0]?.leases)) throw new Error("Active verification/lease tokens require a separate secure export decision");
    const aliasSql = (schema: string) => `SELECT count(*)::int AS matched FROM ${quote(schema)}.item_identity_aliases a
      JOIN ${quote(schema)}.item_identities i ON i.id=a.identity_id
      JOIN ${quote(schema)}.donation_items d ON d.id=i.id
      WHERE a.alias IN (${legacy.map(n => `'DS-${n}'`).join(",")})
        AND i.display_id=regexp_replace(a.alias,'^DS-','DS-L-')
        AND d.item_id=i.display_id AND i.ds_number IS NULL AND d.ds_number IS NULL`;
    if (Number((await client.query(aliasSql("public"))).rows[0]?.matched) !== 14) throw new Error("Legacy alias verification failed");
    await mkdir(output, { recursive: false, mode: 0o700 });
    const archive = resolve(output, "development.dump");
    phase = "consistent pg_dump";
    await run("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", "--schema=public",
      `--snapshot=${snapshotId}`, `--file=${archive}`], true);
    await chmod(archive, 0o600);
    phase = "archive decoding and credential screening";
    await run("pg_restore", ["--no-owner", "--no-privileges", `--file=${resolve(output, "development.sql")}`, archive]);
    const plain = await readFile(resolve(output, "development.sql"), "utf8");
    // Fail closed on common credential formats; never print a matched value.
    const secretLike = /(?:postgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@|github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|(?:sk_live_|sk_test_|ntn_)[A-Za-z0-9]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/;
    if (secretLike.test(plain)) throw new Error("Credential-like content detected; private files retained for secure review, not distributable");
    // Rewrite schema references only outside COPY payloads; never rewrite records.
    let copy = false;
    const rewritten = plain.split("\n").map(line => {
      if (copy) { if (line === "\\.") copy = false; return line; }
      const mapped = line.replace(/\bpublic\./g, `${scratch}.`)
        .replace(/\bSCHEMA public\b/g, `SCHEMA ${scratch}`)
        .replace("set_config('search_path', '', false)", `set_config('search_path', '${scratch},pg_catalog', false)`);
      if (/^COPY /.test(line)) copy = true;
      return mapped;
    }).join("\n");
    const restoreFile = resolve(output, "verification-restore.sql");
    await writeFile(restoreFile, rewritten, { mode: 0o600 });
    scratchMayExist = true;
    phase = "restore into disposable Development schema";
    await run("psql", ["-X", "-v", "ON_ERROR_STOP=1", "--single-transaction", "-f", restoreFile]);
    // A new read-only transaction can see the committed disposable restore.
    phase = "restored data and trigger verification";
    await client.query("ROLLBACK");
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    for (const table of tables) {
      const result = await client.query(`SELECT count(*)::int AS rows,
        md5(coalesce(string_agg(to_jsonb(t)::text,',' ORDER BY to_jsonb(t)::text),'')) AS fingerprint
        FROM ${quote(scratch)}.${quote(table)} t`);
      if (Number(result.rows[0]?.rows) !== summaries[table].rows
        || result.rows[0]?.fingerprint !== summaries[table].fingerprint) throw new Error(`Restore mismatch for ${table}`);
    }
    const restoredCounter = await client.query(`SELECT next_number::text AS n FROM ${quote(scratch)}.tracking_counters WHERE name='item_ds'`);
    const restoredAliases = await client.query(aliasSql(scratch));
    if (restoredCounter.rows[0]?.n !== "6" || Number(restoredAliases.rows[0]?.matched) !== 14) throw new Error("Restored identity/counter verification failed");
    const triggers = await client.query(`SELECT count(*)::int AS n FROM pg_trigger t
      JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace ns ON ns.oid=c.relnamespace
      JOIN pg_proc p ON p.oid=t.tgfoid
      WHERE ns.nspname='${scratch}' AND t.tgname IN
      ('donation_item_ds_number','identity_ds_number','alias_ds_number','snapshot_ds_number')
      AND t.tgenabled IN ('O','A') AND t.tgtype=23 AND p.pronamespace=ns.oid AND p.proname='protect_item_ds_number'`);
    if (Number(triggers.rows[0]?.n) !== 4) throw new Error("Restored DS protection triggers are incomplete");
    const sequences = await client.query(`SELECT sequencename,last_value::text FROM pg_sequences WHERE schemaname='${scratch}' ORDER BY sequencename`);
    await client.query("ROLLBACK");
    await run("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-c", `DROP SCHEMA ${quote(scratch)} CASCADE`]);
    scratchMayExist = false;
    await rm(restoreFile);
    const manifest = {
      createdAt: new Date().toISOString(), environment: "Development only",
      databaseScope: "Complete public application schema and data; provider roles/grants are not portable",
      consistentExportedSnapshot: true, containsPersonalData: true, secretsExported: false,
      credentialScreening: "Common credential patterns screened; no active OTPs or processing leases; arbitrary historical free text cannot be certified",
      rowCounts: Object.fromEntries(tables.map(t => [t, summaries[t].rows])),
      nextDsNumber: "6", legacyAliasesVerified: 14, canonicalDsNumbers: ["1", "2", "3", "4", "5"],
      restoreVerification: { allTablesAndRowFingerprintsMatch: true, dsTriggers: 4, counter: "6", legacyAliases: 14, sequences: sequences.rows },
      supersedes: "account-move-2026-10-16 Development exports only; no refreshed Production snapshot",
    };
    await writeFile(resolve(output, "manifest.json"), JSON.stringify(manifest, null, 2)+"\n", { mode: 0o600 });
    await chmod(resolve(output, "development.sql"), 0o600);
    await writeFile(resolve(output, "README.txt"),
      "CURRENT DEVELOPMENT BACKUP — private personal operational data. Never commit or upload publicly.\n"+
      "Restore development.dump into a NEW EMPTY Development database with services stopped:\n"+
      'pg_restore --exit-on-error --single-transaction --no-owner --no-privileges --dbname=\"$DATABASE_URL\" development.dump\n'+
      "Use the new account's own securely supplied DATABASE_URL. Never target the original or Production database.\n"+
      "Compare all 38 table counts with manifest.json; item_ds must be 6 and all 14 old DS aliases must match their DS-L records.\n"+
      "Run pnpm --filter @workspace/scripts run preflight. Keep Notion writes off; reconnect auth and connectors separately.\n"+
      "Old Development exports are superseded. No new Production export was made. See docs/move-to-dewaynelogan.md in Git.\n", { mode: 0o600 });
    const files = ["development.dump", "development.sql", "manifest.json", "README.txt"];
    const checksums = await Promise.all(files.map(async file =>
      `${createHash("sha256").update(await readFile(resolve(output, file))).digest("hex")}  ${file}`));
    await writeFile(resolve(output, "SHA256SUMS"), checksums.join("\n")+"\n", { mode: 0o600 });
    console.log(JSON.stringify({ path: relative(root, output), ...manifest }, null, 2));
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end().catch(() => {});
    if (scratchMayExist) await run("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-c", `DROP SCHEMA IF EXISTS ${quote(scratch)} CASCADE`]);
  }
}
main().catch(error => {
  console.error(`Development backup/verification failed during ${phase}. ${error instanceof SafeBackupError ? error.message : "Details withheld."} No Production connection was used.`);
  process.exitCode = 1;
});
