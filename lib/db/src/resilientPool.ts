import { AsyncLocalStorage } from "node:async_hooks";
import pg from "pg";
import { DatabaseConnectionRecovery } from "./connectionRecovery";

/** Preserve pg's promise and callback APIs, including checked-out transaction clients. */
export function createResilientPool(config: pg.PoolConfig) {
  const pool = new pg.Pool({
    ...config,
    connectionTimeoutMillis: config.connectionTimeoutMillis ?? 5_000,
    query_timeout: config.query_timeout ?? 10_000,
  });
  const maintenance = new AsyncLocalStorage<boolean>();
  const connect = pool.connect.bind(pool);
  const originalQueries = new WeakMap<pg.PoolClient, pg.PoolClient["query"]>();

  const connection = new DatabaseConnectionRecovery((beforeReady) => maintenance.run(true, async () => {
    const client = await connect();
    let failed = false;
    try {
      const query = originalQueries.get(client) ?? client.query.bind(client);
      const probeQuery: pg.QueryConfig & { query_timeout: number } = {
        text: "SELECT 1", query_timeout: 5_000,
      };
      await query(probeQuery);
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      client.release(failed);
    }
    // Only the idempotent startup repair is retried, never a user transaction.
    await beforeReady();
  }));

  pool.on("error", (error) => connection.reportFailure(error, true));
  pool.on("connect", (client: pg.PoolClient) => {
    const query = client.query.bind(client);
    originalQueries.set(client, query);
    client.on("error", (error) => connection.reportFailure(error));
    client.query = new Proxy(query, {
      apply(target, thisArg, args: unknown[]) {
        const callback = args[args.length - 1];
        if (typeof callback === "function") {
          args[args.length - 1] = (error: unknown, ...results: unknown[]) => {
            if (error) connection.reportFailure(error);
            Reflect.apply(callback, undefined, [error, ...results]);
          };
        }
        try {
          const result = Reflect.apply(target, thisArg, args);
          if (result && typeof result.catch === "function") {
            return result.catch((error: unknown) => {
              connection.reportFailure(error);
              throw error;
            });
          }
          return result;
        } catch (error) {
          connection.reportFailure(error);
          throw error;
        }
      },
    });
  });

  pool.connect = ((callback?: (error: Error | undefined, client: pg.PoolClient | undefined, release: (error?: Error | boolean) => void) => void) => {
    try {
      if (!maintenance.getStore()) connection.assertAvailable();
    } catch (error) {
      if (callback) {
        queueMicrotask(() => callback(error as Error, undefined, () => {}));
        return;
      }
      return Promise.reject(error);
    }
    if (callback) {
      connect((error, client, release) => {
        if (error) connection.reportFailure(error);
        callback(error, client, release);
      });
      return;
    }
    return connect().catch((error: unknown) => {
      connection.reportFailure(error);
      throw error;
    });
  }) as typeof pool.connect;

  const end = pool.end.bind(pool);
  pool.end = ((...args: unknown[]) => {
    connection.stop();
    return Reflect.apply(end, undefined, args);
  }) as typeof pool.end;

  return { pool, connection };
}