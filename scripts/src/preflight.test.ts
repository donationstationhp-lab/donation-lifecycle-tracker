import test from "node:test";
import assert from "node:assert/strict";
import * as schema from "@workspace/db/schema";
import { createInspectionClient, inspectReadOnly, type InspectionClient } from "@workspace/db/inspection";
import {
  CATALOG_SQL, QUERIES, checkDatabase, checkNotionPolicy, compareSchema,
  exitCode, expectedColumns, formatReport, unverifiedDatabase, type Column,
} from "./preflightChecks";

const expected = expectedColumns(schema);
const catalog = expected.map((c) => ({
  table_name: c.table, column_name: c.name, sql_type: c.type, not_null: c.notNull,
}));
const aggregates = {
  linkage: { mismatches: "0", identity_only: "21" },
  identifiers: {
    lineage_mismatches: "0", unpreserved_source_ids: "0", missing_notion_links: "0",
    missing_ids: "0", non_ds_ids: "1", numeric_collisions: "0",
  },
  counter: { next_number: 6396, highest_reserved: "6395" },
  aliases: { ambiguous: "0" },
  locations: { unmatched: "0" },
};

function fixture(overrides: Record<string, unknown> = {}) {
  const sql: string[] = [];
  const client: InspectionClient = {
    async connect() {},
    async end() {},
    async query(text) {
      sql.push(text);
      if (text === "SHOW transaction_read_only") {
        return { rows: [{ transaction_read_only: overrides.readOnly ?? "on" }] };
      }
      if (text === CATALOG_SQL) return { rows: (overrides.catalog ?? catalog) as typeof catalog };
      const key = (Object.keys(QUERIES) as (keyof typeof QUERIES)[])
        .find((name) => QUERIES[name] === text);
      return { rows: key ? [overrides[key] ?? aggregates[key]] as Record<string, unknown>[] : [] };
    },
  };
  return { client, sql };
}

test("schema expectations come from the real Drizzle exports, without app startup", () => {
  assert.equal(new Set(expected.map((c) => c.table)).size, 38);
  assert.ok(expected.some((c) => c.table === "tracking_counters" && c.name === "next_number"));
  const offerColumns = expected.filter((c) => c.table === "donation_submissions");
  for (const name of [
    "reference", "status", "offered_details", "received_details", "received_item_id",
    "reviewed_by", "reviewed_at", "received_by", "received_at",
  ]) assert.ok(offerColumns.some((c) => c.name === name), `Missing offer column ${name}`);
});

test("catalog comparison reports missing, extra and incompatible columns", () => {
  const cols: Column[] = [{ table: "fixture", name: "id", type: "text", notNull: true }];
  assert.equal(compareSchema(cols, cols).status, "PASS");
  assert.equal(compareSchema(cols, []).status, "FAIL");
  assert.equal(compareSchema(cols, [{ ...cols[0], type: "integer" }]).status, "FAIL");
  assert.equal(compareSchema(cols, [{ ...cols[0], notNull: false }]).status, "FAIL");
  assert.equal(compareSchema(cols, [...cols, { ...cols[0], name: "extra" }]).status, "WARN");
});

test("healthy fixture runs SELECTs inside verified read-only transaction and rolls back", async () => {
  const { client, sql } = fixture();
  const checks = await inspectReadOnly(client, (reader) => checkDatabase(reader, expected));
  assert.ok(checks.every((c) => c.status === "PASS"));
  assert.equal(sql[0], "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  assert.equal(sql[1], "SHOW transaction_read_only");
  assert.equal(sql.at(-1), "ROLLBACK");
  assert.ok(sql.slice(2, -1).every((statement) => /^\s*SELECT\b/.test(statement)));
  assert.ok(!sql.some((statement) => /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|nextval|setval|pg_advisory)\b/i.test(statement)));
});

test("unverified read-only mode stops before inspection; connection is closed", async () => {
  const { client, sql } = fixture({ readOnly: "off" });
  let inspected = false;
  let closed = false;
  client.end = async () => { closed = true; };
  await assert.rejects(inspectReadOnly(client, async () => { inspected = true; }));
  assert.equal(inspected, false);
  assert.equal(closed, true);
  assert.equal(sql.at(-1), "ROLLBACK");
});

test("connection and query failures attempt rollback/close without emitting diagnostics", async () => {
  const { client, sql } = fixture();
  let closed = false;
  client.end = async () => { closed = true; };
  await assert.rejects(inspectReadOnly(client, async () => { throw new Error("fixture-private-data"); }));
  assert.equal(closed, true);
  assert.equal(sql.at(-1), "ROLLBACK");
});

test("missing columns skip dependent checks instead of assuming success", async () => {
  const { client, sql } = fixture({
    catalog: catalog.filter((c) => c.table_name !== "tracking_counters"),
  });
  const checks = await checkDatabase(client, expected);
  assert.equal(checks.find((c) => c.check === "schema")?.status, "FAIL");
  assert.equal(checks.find((c) => c.check === "counter")?.status, "UNVERIFIED");
  assert.ok(!sql.includes(QUERIES.counter));
});

test("linkage, preservation, alias and location problems are reported only as counts", async () => {
  const { client } = fixture({
    linkage: { mismatches: "2", identity_only: "21", privateName: "fixture-person-name" },
    identifiers: { ...aggregates.identifiers, unpreserved_source_ids: "1", numeric_collisions: "1" },
    aliases: { ambiguous: "2", alias: "fixture-private-alias" },
    locations: { unmatched: "8", address: "fixture-private-address" },
  });
  const checks = await checkDatabase(client, expected);
  for (const key of ["linkage", "identifiers", "aliases"]) {
    assert.equal(checks.find((c) => c.check === key)?.status, "FAIL");
  }
  assert.equal(checks.find((c) => c.check === "locations")?.status, "WARN");
  assert.doesNotMatch(formatReport(checks), /fixture-person|fixture-private/);
});

test("counter checks the canonical floor with bigint precision and no four-digit cap", async () => {
  for (const [next, highest, status] of [
    [6, "5", "PASS"], [6396, "6396", "FAIL"], [6500, "6395", "PASS"],
    [10000, "9999", "PASS"], [10001, "9999", "PASS"],
    [6396, "99999999999999999999", "FAIL"],
  ] as const) {
    const { client } = fixture({ counter: { next_number: next, highest_reserved: highest } });
    const checks = await checkDatabase(client, expected);
    assert.equal(checks.find((c) => c.check === "counter")?.status, status);
  }
  assert.match(QUERIES.counter, /WHERE value ~ '\^DS-\[0-9\]\+\$'/);
  assert.doesNotMatch(QUERIES.counter, /\bDS-L-/);
  const { client } = fixture({ counter: { next_number: null, highest_reserved: "5" } });
  assert.equal((await checkDatabase(client, expected)).find((c) => c.check === "counter")?.status, "FAIL");
});

test("unknown aggregate values fail closed", async () => {
  const { client } = fixture({ aliases: { ambiguous: "fixture-private-token" } });
  await assert.rejects(checkDatabase(client, expected), /Invalid aggregate response/);
});

test("Notion source policy reports import-only evidence and flags writers/uncertainty", () => {
  const disabled = "notionWritesEnabled: false, requireIdentityImportBeforeNotionWrites: true";
  const query = 'fetch(`https://api.notion.com/v1/data_sources/${id}/query`, {method: "POST"})';
  assert.equal(checkNotionPolicy(disabled, [query]).status, "PASS");
  assert.equal(checkNotionPolicy(disabled.replace("false", "true"), [query]).status, "FAIL");
  assert.equal(checkNotionPolicy(disabled, [query, 'pages.update({})']).status, "FAIL");
  assert.equal(checkNotionPolicy(disabled, []).status, "UNVERIFIED");
  assert.match(checkNotionPolicy(disabled, [query]).detail, /Static inspection only/);
});

test("offline results and exit codes distinguish unknown, failure and warnings", () => {
  const unknown = unverifiedDatabase("No safe read-only connection.");
  assert.equal(unknown.length, 6);
  assert.ok(unknown.every((c) => c.status === "UNVERIFIED"));
  assert.equal(exitCode(unknown), 2);
  assert.equal(exitCode([{ check: "x", status: "FAIL", detail: "fixed" }, ...unknown]), 1);
  assert.equal(exitCode([{ check: "x", status: "WARN", detail: "fixed" }]), 0);
});

test("connection construction rejects non-PostgreSQL URLs and opens no socket", () => {
  assert.throws(() => createInspectionClient("https://example.invalid"));
  // A fixture URL only; construction must not connect.
  const client = createInspectionClient("postgres://fixture:fixture@example.invalid/fixture?options=-c%20default_transaction_read_only%3Doff");
  assert.ok(client);
});
