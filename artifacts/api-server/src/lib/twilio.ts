import { ReplitConnectors } from "@replit/connectors-sdk";

interface TwilioAccountList {
  accounts?: Array<{ sid?: string }>;
}

interface TwilioPhoneNumberList {
  incoming_phone_numbers?: Array<{ phone_number?: string; capabilities?: { sms?: boolean } }>;
}

export class TwilioSmsError extends Error {
  constructor(readonly operation: string, readonly httpStatus: number, readonly providerCode?: number) {
    super(`Twilio ${operation} failed (HTTP ${httpStatus}${providerCode ? `, code ${providerCode}` : ""})`);
  }
}

export class TwilioConfigurationError extends Error {}

async function assertSuccessful(response: Response, operation: string): Promise<void> {
  if (!response.ok) {
    // Provider messages may contain phone numbers; expose only safe numeric codes.
    const body = await response.json().catch(() => ({})) as { code?: unknown };
    throw new TwilioSmsError(operation, response.status, typeof body?.code === "number" ? body.code : undefined);
  }
}

export interface SmsReceipt {
  messageSid: string;
  accountSid: string;
  status: string;
  errorCode?: number;
}

async function receipt(response: Response, operation: string): Promise<SmsReceipt> {
  await assertSuccessful(response, operation);
  const body = await response.json() as { sid?: string; account_sid?: string; status?: string; error_code?: number };
  if (!body.sid || !body.account_sid || !body.status) throw new Error("Twilio returned an incomplete SMS receipt");
  return { messageSid: body.sid, accountSid: body.account_sid, status: body.status, errorCode: body.error_code ?? undefined };
}

export async function validateStagingSmsSender(accountSid: string, from: string): Promise<void> {
  const client = new ReplitConnectors();
  const account = await client.proxy("twilio", `/2010-04-01/Accounts/${accountSid}.json`, { method: "GET" });
  await assertSuccessful(account, "staging account lookup");
  const data = await account.json() as { sid?: string; status?: string };
  if (data.sid !== accountSid || data.status !== "active") throw new TwilioConfigurationError("The explicitly selected staging Twilio account is not active.");
  const numbers = await client.proxy("twilio",
    `/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(from)}`,
    { method: "GET" });
  await assertSuccessful(numbers, "staging sender lookup");
  const body = await numbers.json() as TwilioPhoneNumberList;
  if (!body.incoming_phone_numbers?.some((number) => number.phone_number === from && number.capabilities?.sms === true)) {
    throw new TwilioConfigurationError("The staging sender must belong to the selected account and support SMS.");
  }
}

export async function getSmsDeliveryStatus(accountSid: string, messageSid: string): Promise<SmsReceipt> {
  const response = await new ReplitConnectors().proxy(
    "twilio", `/2010-04-01/Accounts/${accountSid}/Messages/${messageSid}.json`, { method: "GET" },
  );
  return receipt(response, "delivery status lookup");
}

async function getAccountSid(): Promise<string> {
  const response = await new ReplitConnectors().proxy(
    "twilio",
    "/2010-04-01/Accounts.json",
    { method: "GET" },
  );
  await assertSuccessful(response, "account lookup");
  const body = (await response.json()) as TwilioAccountList;
  const accountSid = body.accounts?.[0]?.sid;
  if (!accountSid) {
    throw new Error("Twilio account lookup returned no account");
  }
  return accountSid;
}

async function getSenderNumber(accountSid: string): Promise<string> {
  const configuredNumber = process.env.TWILIO_FROM_NUMBER?.trim();
  if (configuredNumber) return configuredNumber;

  const response = await new ReplitConnectors().proxy(
    "twilio",
    `/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json`,
    { method: "GET" },
  );
  await assertSuccessful(response, "sender number lookup");
  const body = (await response.json()) as TwilioPhoneNumberList;
  const senderNumber = body.incoming_phone_numbers?.[0]?.phone_number;
  if (!senderNumber) {
    throw new Error("No Twilio sender number is configured");
  }
  return senderNumber;
}

export async function sendTrackingVerificationSms(
  phoneNumber: string,
  code: string,
  staging?: { accountSid: string; from: string },
): Promise<SmsReceipt> {
  const accountSid = staging?.accountSid ?? await getAccountSid();
  const from = staging?.from ?? await getSenderNumber(accountSid);
  const response = await new ReplitConnectors().proxy(
    "twilio",
    `/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        To: phoneNumber,
        From: from,
        Body: `${staging ? "STAGING TEST — " : ""}Your Donation Station verification code is ${code}. It expires in 10 minutes.`,
      }).toString(),
    },
  );
  return receipt(response, "SMS send");
}