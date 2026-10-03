import "dotenv/config";
import { logger } from "./lib/logger";
import {
  initializeStartupSecrets,
  STARTUP_SECRET_NAMES,
} from "./lib/startupSecrets";
import { initializeNotionItemLogSchema } from "./lib/notionItemLogSchema";

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

    const notionItemLogSchema = await initializeNotionItemLogSchema();
    logger.info(
      {
        configuredReferenceId: notionItemLogSchema.configuredReferenceId,
        dataSourceId: notionItemLogSchema.dataSourceId,
        propertyCount: Object.keys(notionItemLogSchema.properties).length,
      },
      "Validated Notion Item Log schema",
    );

    const [
      { default: app },
      { startAttendOutboxRetryWorker },
      { startTrackingOtpCleanupWorker },
      { initializeClaimTrackingCodes, databaseConnection, isDatabaseConnectionError },
    ] = await Promise.all([
      import("./app"),
      import("./lib/attendSheets"),
      import("./routes/publicTrack"),
      import("@workspace/db"),
    ]);

    let databaseInitialized = false;
    const initializeDatabase = async () => {
      if (databaseInitialized) return;
      const assigned = await initializeClaimTrackingCodes();
      databaseInitialized = true;
      if (assigned.length > 0) {
        logger.info(
          { assignedClaimTrackingCodes: assigned.length },
          "Assigned missing claim tracking codes",
        );
      }
    };
    databaseConnection.setBeforeReady(initializeDatabase);
    try {
      await initializeDatabase();
    } catch (error) {
      if (!isDatabaseConnectionError(error)) throw error;
      databaseConnection.reportFailure(error);
      logger.warn("Starting API with database unavailable; initialization will resume after reconnection");
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
