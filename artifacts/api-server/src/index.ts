import "dotenv/config";
import { logger } from "./lib/logger";
import {
  initializeStartupSecrets,
  STARTUP_SECRET_NAMES,
} from "./lib/startupSecrets";

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
  try {
    const secretSources = await initializeStartupSecrets();
    for (const name of STARTUP_SECRET_NAMES) {
      logger.info(
        { secretName: name, source: secretSources[name] },
        "Resolved startup secret",
      );
    }

    const [
      { default: app },
      { startAttendOutboxRetryWorker },
      { startTrackingOtpCleanupWorker },
      { initializeClaimTrackingCodes },
    ] = await Promise.all([
      import("./app"),
      import("./lib/attendSheets"),
      import("./routes/publicTrack"),
      import("@workspace/db"),
    ]);

    const assigned = await initializeClaimTrackingCodes();
    if (assigned.length > 0) {
      logger.info(
        { assignedClaimTrackingCodes: assigned.length },
        "Assigned missing claim tracking codes",
      );
    }

    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }

      logger.info({ port }, "Server listening");
      startAttendOutboxRetryWorker();
      startTrackingOtpCleanupWorker();
    });
  } catch (err) {
    logger.error({ err }, "API startup failed");
    process.exit(1);
  }
}

void start();
