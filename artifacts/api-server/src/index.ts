import app from "./app";
import { logger } from "./lib/logger";
import { startAttendOutboxRetryWorker } from "./lib/attendSheets";
import { initializeClaimTrackingCodes } from "@workspace/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function start(): Promise<void> {
  const assigned = await initializeClaimTrackingCodes();
  if (assigned.length > 0) {
    logger.info({ assignedClaimTrackingCodes: assigned.length }, "Assigned missing claim tracking codes");
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
    startAttendOutboxRetryWorker();
  });
}

start().catch((err) => {
  logger.error({ err }, "API startup failed");
  process.exit(1);
});
