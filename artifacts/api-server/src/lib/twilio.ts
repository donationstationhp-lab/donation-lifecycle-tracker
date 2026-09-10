import { ReplitConnectors } from "@replit/connectors-sdk";

interface TwilioAccountList {
  accounts?: Array<{ sid?: string }>;
}

interface TwilioPhoneNumberList {
  incoming_phone_numbers?: Array<{ phone_number?: string }>;
}

function assertSuccessful(response: Response, operation: string): void {
  if (!response.ok) {
    throw new Error(`Twilio ${operation} failed with status ${response.status}`);
  }
}

async function getAccountSid(): Promise<string> {
  const response = await new ReplitConnectors().proxy(
    "twilio",
    "/2010-04-01/Accounts.json",
    { method: "GET" },
  );
  assertSuccessful(response, "account lookup");
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
  assertSuccessful(response, "sender number lookup");
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
): Promise<void> {
  const accountSid = await getAccountSid();
  const from = await getSenderNumber(accountSid);
  const response = await new ReplitConnectors().proxy(
    "twilio",
    `/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        To: phoneNumber,
        From: from,
        Body: `Your Donation Station verification code is ${code}. It expires in 10 minutes.`,
      }).toString(),
    },
  );
  assertSuccessful(response, "SMS delivery");
}