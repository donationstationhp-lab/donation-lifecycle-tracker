import "dotenv/config";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { verifyStagingSms } from "../lib/stagingSmsVerification";
import { logger } from "../lib/logger";

async function main(): Promise<void> {
  const result = await verifyStagingSms({
    environment: process.env.SMS_STAGING_ENVIRONMENT,
    accountSid: process.env.SMS_STAGING_ACCOUNT_SID,
    from: process.env.SMS_STAGING_FROM_NUMBER,
    to: process.env.SMS_STAGING_PHONE_NUMBER,
    confirmRealSend: process.argv.includes("--confirm-real-send"),
    productionRuntime: process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT === "1" || process.env.REPLIT_ENVIRONMENT === "production",
  });
  const dir = resolve(process.cwd(), "../../verification-results");
  logger.info(result, "Controlled staging SMS verification");
  await mkdir(dir, { recursive: true });
  const path = resolve(dir, "staging-sms-latest.json");
  await writeFile(path, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  await appendFile(resolve(dir, "staging-sms-history.jsonl"), `${JSON.stringify(result)}\n`, { mode: 0o600 });
  logger.info({ reportPath: "verification-results/staging-sms-latest.json" }, "Saved staging SMS verification report");
  if (result.outcome !== "PASS") process.exitCode = 1;
}

void main().catch(() => {
  logger.error("Unable to persist staging SMS verification result; inspect local file permissions.");
  process.exitCode = 1;
});