import { getNotionEnv } from "./notion";
import { ITEM_PAIRING_POLICY } from "./itemPairingPolicy";

const NOTION_VERSION = "2025-09-03";
const REQUEST_TIMEOUT_MS = 10_000;

type NotionPropertyType =
  | "title"
  | "rich_text"
  | "select"
  | "status"
  | "number"
  | "date"
  | "files";

type RequiredProperty = {
  name: string;
  type: NotionPropertyType;
  options?: readonly string[];
};

const REQUIRED_PROPERTIES = {
  artifact: { name: "Artifact", type: "files" },
  batchLotId: { name: "Batch/Lot ID", type: "rich_text" },
  category: { name: "Category", type: "select" },
  condition: { name: "Condition", type: "select" },
  dateReceived: { name: "Date Received", type: "date" },
  donor: { name: "Donor", type: "rich_text" },
  expiryDate: { name: "Expiry Date", type: "date" },
  itemId: { name: "Item ID", type: "rich_text" },
  lifecyclePhase: {
    name: "Lifecycle Phase",
    type: "select",
    options: ITEM_PAIRING_POLICY.lifecyclePhases,
  },
  location: { name: "Location", type: "rich_text" },
  name: { name: "Name", type: "title" },
  recipient: { name: "Recipient", type: "rich_text" },
  snowCategoryTier: {
    name: "S.N.O.W. Category Tier",
    type: "select",
    options: ITEM_PAIRING_POLICY.snowCategoryTiers,
  },
  stage: {
    name: "Stage",
    type: "status",
    options: ITEM_PAIRING_POLICY.stages,
  },
  tier: {
    name: "T.I.E.R.",
    type: "select",
    options: ITEM_PAIRING_POLICY.tierValues,
  },
  triRouting: {
    name: "T.R.I. Routing",
    type: "select",
    options: ITEM_PAIRING_POLICY.triRoutingValues,
  },
  weightLbs: { name: "Weight (lbs)", type: "number" },
  weightUnit: {
    name: "Weight Unit",
    type: "select",
    options: ITEM_PAIRING_POLICY.weightUnits,
  },
} as const satisfies Record<string, RequiredProperty>;

type LogicalPropertyName = keyof typeof REQUIRED_PROPERTIES;

type NotionPropertyResponse = {
  id?: unknown;
  type?: unknown;
  select?: { options?: Array<{ name?: unknown }> };
  status?: { options?: Array<{ name?: unknown }> };
};

type NotionDataSourceResponse = {
  object?: unknown;
  id?: unknown;
  properties?: Record<string, NotionPropertyResponse>;
};

type NotionDatabaseResponse = {
  object?: unknown;
  id?: unknown;
  data_sources?: Array<{ id?: unknown; name?: unknown }>;
};

export type NotionItemLogProperty = Readonly<{
  id: string;
  name: string;
  type: NotionPropertyType;
  options: readonly string[];
}>;

export type NotionItemLogSchema = Readonly<{
  configuredReferenceId: string;
  dataSourceId: string;
  properties: Readonly<
    Record<LogicalPropertyName, NotionItemLogProperty>
  >;
}>;

export class NotionItemLogSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotionItemLogSchemaError";
  }
}

let initializedSchema: NotionItemLogSchema | null = null;
let initialization: Promise<NotionItemLogSchema> | null = null;

function normalizeNotionId(value: string): string {
  let source = value;
  try {
    source = new URL(value).pathname;
  } catch {
    // Plain Notion IDs are also accepted.
  }
  const compactMatches = source.match(/[0-9a-f]{32}/gi);
  const dashedMatches = source.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
  );
  const match = dashedMatches?.at(-1) ?? compactMatches?.at(-1);
  if (!match) {
    throw new NotionItemLogSchemaError(
      "NOTION_ITEMS_DATA_SOURCE_URL does not contain a valid Notion database or data-source ID",
    );
  }
  return match.replaceAll("-", "").toLowerCase();
}

function formatNotionId(compactId: string): string {
  return [
    compactId.slice(0, 8),
    compactId.slice(8, 12),
    compactId.slice(12, 16),
    compactId.slice(16, 20),
    compactId.slice(20),
  ].join("-");
}

async function notionRequest(
  path: string,
  apiKey: string,
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`https://api.notion.com/v1${path}`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
        "Notion-Version": NOTION_VERSION,
      },
      signal: controller.signal,
    });
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return { status: response.status, body };
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "AbortError"
        ? `timed out after ${REQUEST_TIMEOUT_MS}ms`
        : error instanceof Error
          ? error.message
          : String(error);
    throw new NotionItemLogSchemaError(
      `Unable to retrieve the Notion Item Log schema: ${reason}`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function notionErrorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const message = (body as { message?: unknown }).message;
  return typeof message === "string" ? message : undefined;
}

async function resolveDataSource(
  configuredReferenceId: string,
  apiKey: string,
): Promise<NotionDataSourceResponse> {
  const dashedId = formatNotionId(configuredReferenceId);
  const direct = await notionRequest(`/data_sources/${dashedId}`, apiKey);
  if (direct.status === 200) {
    return direct.body as NotionDataSourceResponse;
  }

  if (direct.status !== 404) {
    throw new NotionItemLogSchemaError(
      `Notion Item Log data-source lookup failed with HTTP ${direct.status}: ${notionErrorMessage(direct.body) ?? "unknown error"}`,
    );
  }

  const database = await notionRequest(`/databases/${dashedId}`, apiKey);
  if (database.status !== 200) {
    const accessHint =
      database.status === 404
        ? " Share the Item Log database with the Notion integration used by NOTION_API_KEY."
        : "";
    throw new NotionItemLogSchemaError(
      `Notion Item Log reference ${dashedId} is not accessible (HTTP ${database.status}): ${notionErrorMessage(database.body) ?? "unknown error"}${accessHint}`,
    );
  }

  const sources = (database.body as NotionDatabaseResponse).data_sources ?? [];
  const validSources = sources.filter(
    (source): source is { id: string; name?: unknown } =>
      typeof source.id === "string",
  );
  if (validSources.length !== 1) {
    throw new NotionItemLogSchemaError(
      `Notion database ${dashedId} must contain exactly one Item Log data source; found ${validSources.length}`,
    );
  }

  const source = await notionRequest(
    `/data_sources/${validSources[0].id}`,
    apiKey,
  );
  if (source.status !== 200) {
    throw new NotionItemLogSchemaError(
      `Resolved Notion Item Log data source ${validSources[0].id} could not be retrieved (HTTP ${source.status}): ${notionErrorMessage(source.body) ?? "unknown error"}`,
    );
  }
  return source.body as NotionDataSourceResponse;
}

function optionNames(property: NotionPropertyResponse): string[] {
  const options =
    property.type === "status"
      ? property.status?.options
      : property.select?.options;
  return (options ?? [])
    .map((option) => option.name)
    .filter((name): name is string => typeof name === "string");
}

function validateAndMapSchema(
  configuredReferenceId: string,
  response: NotionDataSourceResponse,
): NotionItemLogSchema {
  if (typeof response.id !== "string" || !response.properties) {
    throw new NotionItemLogSchemaError(
      "Notion returned an invalid Item Log data-source response",
    );
  }

  const problems: string[] = [];
  const mapped: Partial<
    Record<LogicalPropertyName, NotionItemLogProperty>
  > = {};

  for (const [logicalName, requirement] of Object.entries(
    REQUIRED_PROPERTIES,
  ) as Array<[LogicalPropertyName, RequiredProperty]>) {
    const live = response.properties[requirement.name];
    if (!live) {
      problems.push(
        `missing property "${requirement.name}" (it may have been renamed or removed)`,
      );
      continue;
    }
    if (live.type !== requirement.type) {
      problems.push(
        `property "${requirement.name}" must be ${requirement.type}, found ${String(live.type)}`,
      );
      continue;
    }
    if (typeof live.id !== "string" || live.id.length === 0) {
      problems.push(`property "${requirement.name}" has no stable property ID`);
      continue;
    }

    const liveOptions = optionNames(live);
    const missingOptions = (requirement.options ?? []).filter(
      (option) => !liveOptions.includes(option),
    );
    if (missingOptions.length > 0) {
      problems.push(
        `property "${requirement.name}" is missing options: ${missingOptions.join(", ")}`,
      );
    }

    mapped[logicalName] = Object.freeze({
      id: live.id,
      name: requirement.name,
      type: requirement.type,
      options: Object.freeze(liveOptions),
    });
  }

  if (problems.length > 0) {
    throw new NotionItemLogSchemaError(
      `Notion Item Log schema validation failed for ${response.id}: ${problems.join("; ")}`,
    );
  }

  return Object.freeze({
    configuredReferenceId,
    dataSourceId: response.id,
    properties: Object.freeze(
      mapped as Record<LogicalPropertyName, NotionItemLogProperty>,
    ),
  });
}

export function initializeNotionItemLogSchema(): Promise<NotionItemLogSchema> {
  if (initializedSchema) return Promise.resolve(initializedSchema);
  if (initialization) return initialization;

  initialization = (async () => {
    const env = getNotionEnv();
    const configuredReferenceId = normalizeNotionId(env.itemsDataSourceUrl);
    const response = await resolveDataSource(
      configuredReferenceId,
      env.apiKey,
    );
    initializedSchema = validateAndMapSchema(
      configuredReferenceId,
      response,
    );
    return initializedSchema;
  })();

  return initialization;
}

export function getNotionItemLogSchema(): NotionItemLogSchema {
  if (!initializedSchema) {
    throw new NotionItemLogSchemaError(
      "Notion Item Log schema was accessed before startup initialization",
    );
  }
  return initializedSchema;
}

export function resetNotionItemLogSchemaForTests(): void {
  initializedSchema = null;
  initialization = null;
}
