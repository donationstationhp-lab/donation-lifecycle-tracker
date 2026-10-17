import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool, installDsNumberConstraints } from "@workspace/db";

/**
 * Test-worker-only schema: copy table definitions, never application records.
 * The acquire listener queues SET before each query on that worker's pool.
 */
export async function isolateTestDatabase(): Promise<() => Promise<void>> {
  const schema = `test_item_ids_${randomUUID().replaceAll("-", "")}`;
  await db.execute(sql`CREATE SCHEMA ${sql.identifier(schema)}`);
  try {
    const tables = await db.execute<{ tablename: string }>(sql`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    `);
    for (const { tablename } of tables.rows) {
      await db.execute(sql`
        CREATE TABLE ${sql.identifier(schema)}.${sql.identifier(tablename)}
        (LIKE public.${sql.identifier(tablename)} INCLUDING ALL)
      `);
    }
  } catch (error) {
    await db.execute(sql`DROP SCHEMA ${sql.identifier(schema)} CASCADE`);
    throw error;
  }

  const selectSchema = (client: {
    query(text: string): Promise<unknown>;
    emit(event: string, error: unknown): unknown;
  }) => {
    // pg queues queries in order, including queries made before BEGIN.
    void client.query(`SET search_path TO "${schema}"`).catch((error: unknown) => {
      client.emit("error", error);
    });
  };
  pool.on("acquire", selectSchema);
  await installDsNumberConstraints(db);
  return async () => {
    pool.off("acquire", selectSchema);
    try {
      await db.execute(sql`DROP SCHEMA ${sql.identifier(schema)} CASCADE`);
    } finally {
      await pool.end();
    }
  };
}
