import { randomInt } from "node:crypto";
import {
  getSmsDeliveryStatus, sendTrackingVerificationSms, validateStagingSmsSender,
  TwilioSmsError, TwilioConfigurationError, type SmsReceipt,
} from "./twilio";

export interface StagingSmsConfig {
  environment?: string;
  accountSid?: string;
  from?: string;
  to?: string;
  confirmRealSend: boolean;
  productionRuntime: boolean;
}

export interface StagingSmsResult {
  environment: "staging";
  startedAt: string;
  finishedAt: string;
  outcome: "PASS" | "FAIL" | "BLOCKED" | "INCONCLUSIVE";
  reason: string;
  messageSid?: string;
  statuses: string[];
  providerCode?: number;
  configurationIssues?: string[];
}

const E164 = /^\+[1-9]\d{7,14}$/;
export function stagingSmsIssues(config: StagingSmsConfig): string[] {
  const issues: string[] = [];
  if (config.productionRuntime) issues.push("Refusing to run in a production runtime.");
  if (config.environment !== "staging") issues.push("SMS_STAGING_ENVIRONMENT must explicitly be staging.");
  if (!config.confirmRealSend) issues.push("An explicit --confirm-real-send flag is required.");
  if (!/^AC[0-9a-fA-F]{32}$/.test(config.accountSid ?? "")) issues.push("SMS_STAGING_ACCOUNT_SID must identify the dedicated staging Twilio account; no account auto-selection is allowed.");
  if (!E164.test(config.from ?? "")) issues.push("SMS_STAGING_FROM_NUMBER is required in E.164 format (+country code and digits, no spaces).");
  if (!E164.test(config.to ?? "")) issues.push("SMS_STAGING_PHONE_NUMBER is required in E.164 format for an approved, consenting test recipient.");
  if (config.from && config.from === config.to) issues.push("The staging sender and recipient must be different numbers.");
  return issues;
}

interface Transport {
  validate(accountSid: string, from: string): Promise<void>;
  send(to: string, code: string, staging: { accountSid: string; from: string }): Promise<SmsReceipt>;
  status(accountSid: string, messageSid: string): Promise<SmsReceipt>;
}
const transport: Transport = {
  validate: validateStagingSmsSender, send: sendTrackingVerificationSms, status: getSmsDeliveryStatus,
};

function providerAdvice(code?: number): string {
  switch (code) {
    case 21211: case 21614: return "The recipient number is invalid or not SMS-capable; verify its E.164 format and country.";
    case 21606: return "The sender number is not valid or not SMS-capable for this account.";
    case 21608: return "The trial account cannot message this recipient until it is verified in Twilio.";
    case 21610: return "The recipient has opted out; do not send again without renewed consent.";
    case 30007: return "The carrier filtered the message; check sender registration and message compliance.";
    case 30034: return "The sender lacks required A2P registration; finish provider approval before retrying.";
    default: return "Check the staging Twilio connection, account permissions, sender registration, and geographic messaging permissions.";
  }
}

/** Exactly one send. Only status lookups are polled; failed sends are never retried. */
export async function verifyStagingSms(
  config: StagingSmsConfig,
  options: { transport?: Transport; timeoutMs?: number; intervalMs?: number } = {},
): Promise<StagingSmsResult> {
  const result: StagingSmsResult = {
    environment: "staging", startedAt: new Date().toISOString(), finishedAt: "",
    outcome: "BLOCKED", reason: "", statuses: [],
  };
  const finish = () => ({ ...result, finishedAt: new Date().toISOString() });
  const issues = stagingSmsIssues(config);
  if (issues.length) {
    result.reason = "Configuration incomplete; no SMS was attempted.";
    result.configurationIssues = issues;
    return finish();
  }
  const api = options.transport ?? transport;
  const accountSid = config.accountSid!;
  const from = config.from!;
  let sendAttempted = false;
  try {
    await api.validate(accountSid, from);
    sendAttempted = true;
    const sent = await api.send(config.to!, String(randomInt(100000, 1000000)), { accountSid, from });
    result.messageSid = sent.messageSid;
    let current = sent;
    const deadline = Date.now() + (options.timeoutMs ?? 180_000);
    for (;;) {
      if (current.accountSid !== accountSid || current.messageSid !== sent.messageSid) {
        result.outcome = "INCONCLUSIVE";
        result.reason = "SMS receipt did not match the explicitly selected staging account and message; do not resend until investigated.";
        return finish();
      }
      if (result.statuses.at(-1) !== current.status) result.statuses.push(current.status);
      if (current.status === "delivered") {
        result.outcome = "PASS";
        result.reason = "Twilio confirmed delivered. This confirms provider/carrier delivery, not handset reading or the public OTP claim flow.";
        return finish();
      }
      if (["failed", "undelivered", "canceled"].includes(current.status)) {
        result.outcome = "FAIL";
        result.providerCode = current.errorCode;
        result.reason = providerAdvice(current.errorCode);
        return finish();
      }
      if (Date.now() >= deadline) {
        result.outcome = "INCONCLUSIVE";
        result.reason = "No delivered status within the observation period; queued/sent is not a delivery pass. Inspect this message before sending another test.";
        return finish();
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(options.intervalMs ?? 3_000, Math.max(1, deadline - Date.now()))));
      current = await api.status(accountSid, sent.messageSid);
    }
  } catch (error) {
    result.outcome = result.messageSid || (sendAttempted && !(error instanceof TwilioSmsError))
      ? "INCONCLUSIVE" : "FAIL";
    result.providerCode = error instanceof TwilioSmsError ? error.providerCode : undefined;
    result.reason = error instanceof TwilioConfigurationError ? error.message : error instanceof TwilioSmsError
      ? (error.httpStatus === 401 || error.httpStatus === 403
        ? "Twilio credentials are invalid or lack permission for the staging account; reconnect the staging integration."
        : providerAdvice(error.providerCode))
      : sendAttempted
        ? "Provider communication failed during send or delivery observation. Delivery is unknown; inspect Twilio messages before sending another test. No automatic resend was attempted."
        : "Staging account/sender validation or provider communication failed. Check the integration and selected sender; no SMS send was attempted.";
    return finish();
  }
}