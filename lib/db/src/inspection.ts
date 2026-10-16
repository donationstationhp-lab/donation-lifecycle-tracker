import { Client } from "pg";

export interface InspectionClient {
  connect(): Promise<unknown>;
  query(text: string): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<unknown>;
}

/**
 * Deliberately separate from the application pool and startup initializers.
 * A URL-supplied options parameter must not disable the read-only default.
 */
export function createInspectionClient(connectionString: string): InspectionClient {
  const url = new URL(connectionString);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("Unsupported database connection");
  }
  url.searchParams.delete("options");
  return new Client({
    connectionString: url.toString(),
    options: "-c default_transaction_read_only=on -c statement_timeout=5000",
    connectionTimeoutMillis: 5_000,
    application_name: "donation-station-read-only-preflight",
  });
}

export async function inspectReadOnly<T>(
  client: InspectionClient,
  inspect: (client: Pick<InspectionClient, "query">) => Promise<T>,
): Promise<T> {
  try {
    await client.connect();
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const result = await client.query("SHOW transaction_read_only");
    if (result.rows[0]?.transaction_read_only !== "on") {
      throw new Error("Read-only transaction could not be verified");
    }
    return await inspect(client);
  } finally {
    // Never commit, even after successful inspection. Cleanup errors must not
    // leak connection diagnostics or replace the original failure.
    try { await client.query("ROLLBACK"); } catch { /* connection may have failed */ }
    try { await client.end(); } catch { /* no diagnostics emitted */ }
  }
}
