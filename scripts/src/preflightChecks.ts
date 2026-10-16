import { isTable } from "drizzle-orm";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import type { InspectionClient } from "@workspace/db/inspection";

export type Status = "PASS" | "WARN" | "FAIL" | "UNVERIFIED";
export type Check = { check: string; status: Status; detail: string };
export type Column = { table: string; name: string; type: string; notNull: boolean };
type Reader = Pick<InspectionClient, "query">;

export function expectedColumns(schema: Record<string, unknown>): Column[] {
  return Object.values(schema).filter(isTable).flatMap((table) => {
    const config = getTableConfig(table as PgTable);
    return config.columns.map((column) => ({
      table: config.name, name: column.name,
      type: column.getSQLType(), notNull: column.notNull,
    }));
  });
}

function normalizeType(type: string): string {
  return type.replaceAll('"', "").toLowerCase().replace(/\s+/g, " ").trim()
    .replace(/^int4$/, "integer").replace(/^float4$/, "real")
    .replace(/^timestamptz$/, "timestamp with time zone")
    .replace(/^timestamp without time zone$/, "timestamp");
}

export function compareSchema(expected: Column[], actual: Column[]): Check {
  const key = (c: Column) => `${c.table}.${c.name}`;
  const actualMap = new Map(actual.map((c) => [key(c), c]));
  const expectedKeys = new Set(expected.map(key));
  const missing = expected.filter((c) => !actualMap.has(key(c))).length;
  const changed = expected.filter((c) => {
    const observed = actualMap.get(key(c));
    return observed && (normalizeType(c.type) !== normalizeType(observed.type)
      || c.notNull !== observed.notNull);
  }).length;
  const extra = actual.filter((c) => !expectedKeys.has(key(c))).length;
  const expectedTables = new Set(expected.map((c) => c.table)).size;
  const actualTables = new Set(actual.map((c) => c.table)).size;
  return {
    check: "schema",
    status: missing || changed ? "FAIL" : extra ? "WARN" : "PASS",
    detail: `Expected ${expectedTables} tables/${expected.length} columns; observed ${actualTables} tables/${actual.length} columns. Missing columns: ${missing}; type/nullability mismatches: ${changed}; extra columns: ${extra}. Indexes, defaults and migration history are not certified.`,
  };
}

export const CATALOG_SQL = `
SELECT c.relname AS table_name, a.attname AS column_name,
       format_type(a.atttypid,a.atttypmod) AS sql_type, a.attnotnull AS not_null
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN pg_attribute a ON a.attrelid=c.oid
WHERE n.nspname='public' AND c.relkind IN ('r','p')
  AND a.attnum>0 AND NOT a.attisdropped
ORDER BY c.relname,a.attnum`;

// Fixed SELECT statements only. Never select names, contact details, addresses,
// notes, URLs, credentials or record-level identifiers into the report.
export const QUERIES = {
  linkage: `
SELECT
 (SELECT count(*) FROM donation_items d LEFT JOIN item_identities i ON i.id=d.id
  WHERE i.id IS NULL OR i.display_id IS DISTINCT FROM d.item_id) AS mismatches,
 (SELECT count(*) FROM item_identities i WHERE NOT EXISTS
  (SELECT 1 FROM donation_items d WHERE d.id=i.id)) AS identity_only`,
  identifiers: `
SELECT
 (SELECT count(*) FROM item_identities
  WHERE lineage IS DISTINCT FROM CASE
    WHEN display_id ~ '^DS-[0-9]+$' THEN 'DS'
    WHEN display_id ~ '^DS-L-[0-9]+$' THEN 'DS-L'
    ELSE 'unidentified' END) AS lineage_mismatches,
 (SELECT count(*) FROM notion_item_snapshots s JOIN item_identities i ON i.id=s.identity_id
  WHERE s.source_item_id IS NOT NULL AND s.source_item_id IS DISTINCT FROM i.display_id
    AND NOT EXISTS (SELECT 1 FROM item_identity_aliases a
      WHERE a.identity_id=s.identity_id AND a.alias=s.source_item_id)) AS unpreserved_source_ids,
 (SELECT count(*) FROM notion_item_snapshots s WHERE NOT EXISTS
  (SELECT 1 FROM item_external_references r WHERE r.identity_id=s.identity_id
   AND r.provider='notion' AND r.external_id=s.notion_page_id)) AS missing_notion_links,
 (SELECT count(*) FROM item_identities WHERE display_id IS NULL) AS missing_ids,
 (SELECT count(*) FROM item_identities WHERE display_id IS NOT NULL
    AND display_id !~ '^DS-[0-9]+$' AND display_id !~ '^DS-L-[0-9]+$') AS non_ds_ids,
 (SELECT count(*) FROM (
   SELECT substring(display_id FROM 4)::numeric FROM item_identities
   WHERE display_id ~ '^DS-[0-9]+$'
   GROUP BY substring(display_id FROM 4)::numeric HAVING count(*)>1
  ) duplicates) AS numeric_collisions`,
  counter: `
SELECT
 (SELECT next_number FROM tracking_counters WHERE name='item_ds') AS next_number,
 (SELECT COALESCE(MAX(substring(value FROM 4)::numeric),0)::text FROM (
    SELECT item_id AS value FROM donation_items
    UNION ALL SELECT display_id FROM item_identities
    UNION ALL SELECT source_item_id FROM notion_item_snapshots
    UNION ALL SELECT alias FROM item_identity_aliases
  ) reserved WHERE value ~ '^DS-[0-9]+$') AS highest_reserved`,
  aliases: `
SELECT count(*) AS ambiguous FROM (
 SELECT key FROM (
   SELECT alias AS key,identity_id FROM item_identity_aliases
   UNION ALL SELECT display_id AS key,id AS identity_id FROM item_identities
     WHERE display_id IS NOT NULL
 ) candidates GROUP BY key HAVING count(DISTINCT identity_id)>1
) ambiguous_keys`,
  locations: `
SELECT count(*) AS unmatched FROM donation_items d
WHERE d.location IS NOT NULL AND btrim(d.location)<>''
  AND NOT EXISTS (SELECT 1 FROM locations l WHERE l.code=d.location)`,
} as const;

const required: Record<keyof typeof QUERIES, string[]> = {
  linkage: ["donation_items.id", "donation_items.item_id", "item_identities.id", "item_identities.display_id"],
  identifiers: [
    "item_identities.id", "item_identities.display_id", "item_identities.lineage",
    "notion_item_snapshots.identity_id", "notion_item_snapshots.source_item_id", "notion_item_snapshots.notion_page_id",
    "item_identity_aliases.identity_id", "item_identity_aliases.alias",
    "item_external_references.identity_id", "item_external_references.provider", "item_external_references.external_id",
  ],
  counter: [
    "tracking_counters.name", "tracking_counters.next_number", "donation_items.item_id",
    "item_identities.display_id", "notion_item_snapshots.source_item_id", "item_identity_aliases.alias",
  ],
  aliases: ["item_identity_aliases.alias", "item_identity_aliases.identity_id", "item_identities.display_id", "item_identities.id"],
  locations: ["donation_items.location", "locations.code"],
};

function count(row: Record<string, unknown>, key: string): number {
  const value = row[key];
  if (value === null || value === undefined || !/^\d+$/.test(String(value))) {
    throw new Error("Invalid aggregate response");
  }
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error("Invalid aggregate response");
  return result;
}

function describe(key: keyof typeof QUERIES, row: Record<string, unknown>): Check {
  if (key === "linkage") {
    const bad = count(row, "mismatches");
    return { check: key, status: bad ? "FAIL" : "PASS",
      detail: `App item/registry mismatches: ${bad}. Identity-only records: ${count(row, "identity_only")} (allowed; not automatically inventory).` };
  }
  if (key === "identifiers") {
    const lineage = count(row, "lineage_mismatches");
    const lost = count(row, "unpreserved_source_ids");
    const references = count(row, "missing_notion_links");
    const collisions = count(row, "numeric_collisions");
    return { check: key, status: lineage + lost + references + collisions ? "FAIL" : "PASS",
      detail: `Lineage mismatches: ${lineage}; unpreserved source IDs: ${lost}; missing Notion references: ${references}; numeric DS collisions: ${collisions}. Missing IDs: ${count(row, "missing_ids")}; non-DS IDs: ${count(row, "non_ds_ids")} (reported, never invented or renumbered). Current stored evidence only; no historical preservation certification.` };
  }
  if (key === "counter") {
    if (row.next_number === null || row.next_number === undefined) {
      return { check: key, status: "FAIL", detail: "Item counter row is missing. No counter was created." };
    }
    const next = count(row, "next_number");
    const highest = BigInt(String(row.highest_reserved));
    // This is a read-only audit floor, NOT an allocator seed. A greater current
    // counter is valid and must never be lowered to this historical baseline.
    const safe = next >= 6396 && BigInt(next) > highest;
    return { check: key, status: !safe || next > 10000 ? "FAIL" : next === 10000 ? "WARN" : "PASS",
      detail: `Counter is ${safe ? "above stored DS reservations and at/above the 6396 audit floor" : "below the audit floor or not above stored DS reservations"}. ${next === 10000 ? "Existing four-digit namespace is exhausted." : next > 10000 ? "Counter exceeds the current allocator sentinel." : "Current four-digit allocation limit is unchanged."} DS-L values do not advance the DS counter. Gaps are valid; no number was allocated, reserved or reset. Deleted/external-only history cannot be certified.` };
  }
  if (key === "aliases") {
    const bad = count(row, "ambiguous");
    return { check: key, status: bad ? "FAIL" : "PASS",
      detail: `Ambiguous alias/display-ID lookup keys: ${bad}. No candidates were merged.` };
  }
  const bad = count(row, "unmatched");
  return { check: key, status: bad ? "WARN" : "PASS",
    detail: `Nonempty item location values without an exact known location-code match: ${bad}. No locations inferred or changed.` };
}

export function unverifiedDatabase(reason: string): Check[] {
  return ["schema", ...Object.keys(QUERIES)].map((check) => ({
    check, status: "UNVERIFIED", detail: reason,
  }));
}

export async function checkDatabase(reader: Reader, expected: Column[]): Promise<Check[]> {
  const result = await reader.query(CATALOG_SQL);
  const actual = result.rows.map((r): Column => {
    if (typeof r.table_name !== "string" || typeof r.column_name !== "string"
      || typeof r.sql_type !== "string" || typeof r.not_null !== "boolean") {
      throw new Error("Invalid catalog response");
    }
    return { table: r.table_name, name: r.column_name, type: r.sql_type, notNull: r.not_null };
  });
  const observed = new Set(actual.map((c) => `${c.table}.${c.name}`));
  const checks = [compareSchema(expected, actual)];
  for (const key of Object.keys(QUERIES) as (keyof typeof QUERIES)[]) {
    if (required[key].some((column) => !observed.has(column))) {
      checks.push({ check: key, status: "UNVERIFIED",
        detail: "Required database columns are missing; dependent check was not run." });
      continue;
    }
    const response = await reader.query(QUERIES[key]);
    checks.push(describe(key, response.rows[0] ?? {}));
  }
  return checks;
}

export function checkNotionPolicy(policy: string, notionSources: string[]): Check {
  const disabled = /notionWritesEnabled:\s*false\b/.test(policy)
    && !/notionWritesEnabled:\s*true\b/.test(policy);
  const gated = /requireIdentityImportBeforeNotionWrites:\s*true\b/.test(policy);
  const queryReader = notionSources.some((s) => s.includes("/query") && /method:\s*["']POST["']/.test(s));
  const writer = notionSources.some((s) =>
    /(?:pages|blocks)\.(?:create|update|delete|append)\s*\(|method:\s*["'](?:PATCH|PUT|DELETE)["']|\/v1\/pages/.test(s));
  return { check: "notion-policy", status: writer || !disabled ? "FAIL" : gated && queryReader ? "PASS" : "UNVERIFIED",
    detail: writer || !disabled
      ? "Disabled-write policy could not be confirmed, or a possible Notion write path was found. Manual review required."
      : `Writes are disabled in source policy. ${gated && queryReader ? "Import gate and query-reader evidence are present; inspected integration appears import-only." : "Import-only evidence is incomplete."} Static inspection only: no Notion request made; runtime configuration and arbitrary/dynamic write paths are not certified.` };
}

export function exitCode(checks: Check[]): number {
  return checks.some((c) => c.status === "FAIL") ? 1
    : checks.some((c) => c.status === "UNVERIFIED") ? 2 : 0;
}

export function formatReport(checks: Check[]): string {
  return [
    "Donation Lifecycle Tracker — read-only preflight",
    "Baseline: current Replit workspace, not GitHub main. Database: supplied connection; deployment identity not independently verified.",
    "Output contains only fixed diagnostics and aggregate counts. No IDs allocated, migrations run, or external writes performed.",
    ...checks.map((c) => `[${c.status}] ${c.check}: ${c.detail}`),
  ].join("\n");
}
