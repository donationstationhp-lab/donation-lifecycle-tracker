import { readFile, readdir } from "node:fs/promises";
import * as schema from "@workspace/db/schema";
import { createInspectionClient, inspectReadOnly } from "@workspace/db/inspection";
import {
  checkDatabase, checkNotionPolicy, exitCode, expectedColumns,
  formatReport, unverifiedDatabase, type Check,
} from "./preflightChecks";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--offline")) {
    console.log("Usage: pnpm --filter @workspace/scripts run preflight [--offline]");
    process.exitCode = 2;
    return;
  }
  const checks: Check[] = [];
  try {
    const lib = new URL("../../artifacts/api-server/src/lib/", import.meta.url);
    const names = (await readdir(lib)).filter((name) =>
      name.startsWith("notion") && name.endsWith(".ts") && !name.endsWith(".test.ts"));
    const [policy, ...sources] = await Promise.all([
      readFile(new URL("itemPairingPolicy.ts", lib), "utf8"),
      ...names.map((name) => readFile(new URL(name, lib), "utf8")),
    ]);
    checks.push(checkNotionPolicy(policy, sources));
  } catch {
    checks.push({ check: "notion-policy", status: "UNVERIFIED",
      detail: "Local Notion policy/source inspection unavailable. No external request was attempted." });
  }

  if (args.includes("--offline") || !process.env.DATABASE_URL) {
    checks.push(...unverifiedDatabase("No safe read-only database inspection performed (offline or connection not configured)."));
  } else {
    try {
      const client = createInspectionClient(process.env.DATABASE_URL);
      checks.push(...await inspectReadOnly(client, (reader) =>
        checkDatabase(reader, expectedColumns(schema))));
    } catch {
      // Driver messages and SQL errors may contain URLs, credentials or values.
      // Never log the error object, message, stack, environment or connection.
      checks.push(...unverifiedDatabase("Safe read-only database inspection unavailable or incomplete. No database result certified; connection/error details suppressed."));
    }
  }
  console.log(formatReport(checks));
  process.exitCode = exitCode(checks);
}

main().catch(() => {
  console.log("Preflight could not complete safely. Diagnostic details suppressed.");
  process.exitCode = 2;
});
