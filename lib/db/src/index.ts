import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { createResilientPool } from "./resilientPool";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const { pool, connection: databaseConnection } = createResilientPool({
  connectionString: process.env.DATABASE_URL,
});
export const db = drizzle(pool, { schema });

export * from "./connectionRecovery";
export { createResilientPool } from "./resilientPool";
export * from "./schema";
export * from "./trackingCodes";
export * from "./passwords";
