import assert from "node:assert/strict";
import test from "node:test";
import { initializeStartupSecrets } from "./startupSecrets";
import {
  initializeNotionItemLogSchema,
  resetNotionItemLogSchemaForTests,
} from "./notionItemLogSchema";

const DATABASE_ID = "218acff8-868d-4217-a161-ca78babfe37b";
const DATA_SOURCE_ID = "18bec815-4e6f-43ad-ae70-fd95222704ce";

function property(
  id: string,
  type: string,
  options: readonly string[] = [],
): Record<string, unknown> {
  return {
    id,
    type,
    ...(type === "select"
      ? { select: { options: options.map((name) => ({ name })) } }
      : {}),
    ...(type === "status"
      ? { status: { options: options.map((name) => ({ name })) } }
      : {}),
  };
}

function validDataSource(): Record<string, unknown> {
  return {
    object: "data_source",
    id: DATA_SOURCE_ID,
    properties: {
      Artifact: property("artifact-id", "files"),
      "Batch/Lot ID": property("batch-id", "rich_text"),
      Category: property("category-id", "select"),
      Condition: property("condition-id", "select"),
      "Date Received": property("received-id", "date"),
      Donor: property("donor-id", "rich_text"),
      "Expiry Date": property("expiry-id", "date"),
      "Item ID": property("item-id", "rich_text"),
      "Lifecycle Phase": property("lifecycle-id", "select", [
        "Intake",
        "Signal",
        "Grounded",
      ]),
      Location: property("location-id", "rich_text"),
      Name: property("name-id", "title"),
      Recipient: property("recipient-id", "rich_text"),
      "S.N.O.W. Category Tier": property("snow-id", "select", [
        "URGENT",
        "STABLE",
        "SURPLUS",
      ]),
      Stage: property("stage-id", "status", [
        "intake",
        "matched",
        "scheduled",
        "qc",
        "storage",
        "distributed",
        "closed",
      ]),
      "T.I.E.R.": property("tier-id", "select", [
        "T — Time",
        "I — Intelligence",
        "E — Energy",
        "R — Resources",
      ]),
      "T.R.I. Routing": property("routing-id", "select", [
        "GIVE",
        "GIVE-UTILITY",
        "NEEDS-LABOR",
        "RECYCLE-ONLY",
      ]),
      "Weight (lbs)": property("weight-id", "number"),
      "Weight Unit": property("weight-unit-id", "select", [
        "lbs",
        "kg (unconverted)",
      ]),
    },
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function prepareEnvironment(): Promise<void> {
  delete process.env.VAULT_SERVICE_TOKEN;
  process.env.NOTION_API_KEY = "test-notion-key";
  process.env.DONATION_STATION_API_KEY = "test-api-key";
  process.env.NOTION_ITEMS_DATA_SOURCE_URL =
    `https://app.notion.com/p/${DATABASE_ID.replaceAll("-", "")}?v=2666ab925aa748259bd3ea055d984ad6&source=copy_link`;
  process.env.NOTION_ROUTES_DATA_SOURCE_URL = "https://www.notion.so/routes";
  await initializeStartupSecrets();
  resetNotionItemLogSchemaForTests();
}

test("resolves a parent database to its data source and stores property IDs", async () => {
  await prepareEnvironment();
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requests.push(url);
    if (url.includes(`/data_sources/${DATABASE_ID}`)) {
      return jsonResponse(404, {
        code: "object_not_found",
        message: "Could not find data source",
      });
    }
    if (url.includes(`/databases/${DATABASE_ID}`)) {
      return jsonResponse(200, {
        object: "database",
        id: DATABASE_ID,
        data_sources: [{ id: DATA_SOURCE_ID, name: "Item Log" }],
      });
    }
    if (url.includes(`/data_sources/${DATA_SOURCE_ID}`)) {
      return jsonResponse(200, validDataSource());
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  try {
    const schema = await initializeNotionItemLogSchema();
    assert.equal(schema.configuredReferenceId, DATABASE_ID.replaceAll("-", ""));
    assert.equal(schema.dataSourceId, DATA_SOURCE_ID);
    assert.equal(schema.properties.snowCategoryTier.id, "snow-id");
    assert.equal(schema.properties.tier.id, "tier-id");
    assert.equal(schema.properties.weightLbs.id, "weight-id");
    assert.equal(schema.properties.artifact.id, "artifact-id");
    assert.equal(requests.length, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects renamed properties and missing required status options clearly", async () => {
  await prepareEnvironment();
  const response = validDataSource();
  const properties = response.properties as Record<string, unknown>;
  delete properties["S.N.O.W. Category Tier"];
  properties.Stage = property("stage-id", "status", [
    "intake",
    "qc",
    "storage",
    "distributed",
  ]);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => jsonResponse(200, response);
  try {
    await assert.rejects(
      initializeNotionItemLogSchema(),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(
          error.message,
          /missing property "S\.N\.O\.W\. Category Tier"/,
        );
        assert.match(error.message, /Stage.*matched, scheduled, closed/);
        assert.doesNotMatch(error.message, /test-notion-key/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("deduplicates concurrent schema initialization", async () => {
  await prepareEnvironment();
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return jsonResponse(200, validDataSource());
  };
  try {
    const [first, second] = await Promise.all([
      initializeNotionItemLogSchema(),
      initializeNotionItemLogSchema(),
    ]);
    assert.equal(first, second);
    assert.equal(requests, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});