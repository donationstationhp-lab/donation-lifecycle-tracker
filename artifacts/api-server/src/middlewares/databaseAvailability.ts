import type { ErrorRequestHandler, RequestHandler, Response } from "express";
import { databaseConnection, isDatabaseConnectionError, type DatabaseConnectionRecovery } from "@workspace/db";
import { logger } from "../lib/logger";

databaseConnection.on("unavailable", (details) => {
  logger.warn(details, "Database unavailable; API remains running");
});
databaseConnection.on("retry", (details) => {
  logger.warn(details, "Database recovery deferred");
});
databaseConnection.on("recovered", () => {
  logger.info("Database connection recovered");
});

function unavailable(res: Response, connection: DatabaseConnectionRecovery): void {
  res.set("Retry-After", String(connection.retryAfterSeconds));
  res.status(503).json({
    error: "Database temporarily unavailable. Please try again shortly.",
    code: "DATABASE_UNAVAILABLE",
  });
}

export function createDatabaseAvailabilityHandlers(connection: DatabaseConnectionRecovery) {
  const requireDatabase: RequestHandler = (_req, res, next) => {
    if (!connection.isAvailable) {
      unavailable(res, connection);
      return;
    }
    next();
  };

  const databaseErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
    if (!isDatabaseConnectionError(error)) {
      next(error);
      return;
    }
    connection.reportFailure(error);
    if (res.headersSent) {
      next(error);
      return;
    }
    unavailable(res, connection);
  };
  return { requireDatabase, databaseErrorHandler };
}

export const { requireDatabase, databaseErrorHandler } = createDatabaseAvailabilityHandlers(databaseConnection);