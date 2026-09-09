import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq, isNull, lt } from "drizzle-orm";
import {
  claimsTable,
  db,
  donationItemsTable,
  recipientAccountsTable,
  trackingOtpsTable,
} from "@workspace/db";

const router: IRouter = Router();

const OTP_TTL_MS = 10 * 60_000;
const OTP_RESEND_COOLDOWN_MS = 60_000;
const OTP_MAX_ATTEMPTS = 5;
const genericSendResponse = {
  message: "If the tracking code is eligible, a verification code will be sent.",
};

function normalizedTrackingCode(value: string | string[]): string {
  return (Array.isArray(value) ? value[0] : value).trim().toUpperCase();
}

function hashOtp(trackingCode: string, code: string, pepper: string): Buffer {
  return createHmac("sha256", pepper)
    .update(`${trackingCode}:${code}`)
    .digest();
}

function configuredSecret(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

async function sendTwilioOtp(to: string, code: string): Promise<void> {
  const accountSid = configuredSecret("TWILIO_ACCOUNT_SID");
  const authToken = configuredSecret("TWILIO_AUTH_TOKEN");
  const fromNumber = configuredSecret("TWILIO_FROM_NUMBER");
  const body = new URLSearchParams({
    To: to,
    From: fromNumber,
    Body: `Your Donation Station verification code is ${code}. It expires in 10 minutes.`,
  });

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
    {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );

  if (!response.ok) {
    throw new Error(`Twilio SMS request failed (${response.status})`);
  }
}

async function getPublicTrackingResult(trackingCode: string) {
  const [row] = await db
    .select({
      trackingCode: claimsTable.trackingCode,
      claimStatus: claimsTable.status,
      claimCreatedAt: claimsTable.createdAt,
      claimUpdatedAt: claimsTable.updatedAt,
      itemId: donationItemsTable.itemId,
      itemStage: donationItemsTable.stage,
    })
    .from(claimsTable)
    .innerJoin(donationItemsTable, eq(claimsTable.itemId, donationItemsTable.id))
    .where(eq(claimsTable.trackingCode, trackingCode))
    .limit(1);

  return row;
}

router.get("/public/track/:trackingCode", async (req, res): Promise<void> => {
  const trackingCode = normalizedTrackingCode(req.params.trackingCode);
  const result = await getPublicTrackingResult(trackingCode);

  if (!result) {
    res.status(404).json({ error: "Tracking record not found" });
    return;
  }

  res.json(result);
});

router.post("/public/track/:trackingCode/send-otp", async (req, res): Promise<void> => {
  const trackingCode = normalizedTrackingCode(req.params.trackingCode);
  const [claim] = await db
    .select({
      id: claimsTable.id,
      accountId: claimsTable.accountId,
    })
    .from(claimsTable)
    .where(eq(claimsTable.trackingCode, trackingCode))
    .limit(1);

  if (!claim) {
    res.status(202).json(genericSendResponse);
    return;
  }

  const [account] = await db
    .select({ contactPhone: recipientAccountsTable.contactPhone })
    .from(recipientAccountsTable)
    .where(eq(recipientAccountsTable.id, claim.accountId))
    .limit(1);

  if (!account?.contactPhone?.trim()) {
    res.status(202).json(genericSendResponse);
    return;
  }

  const [latestOtp] = await db
    .select({ createdAt: trackingOtpsTable.createdAt })
    .from(trackingOtpsTable)
    .where(eq(trackingOtpsTable.claimId, claim.id))
    .orderBy(desc(trackingOtpsTable.createdAt))
    .limit(1);

  if (
    latestOtp &&
    Date.now() - latestOtp.createdAt.getTime() < OTP_RESEND_COOLDOWN_MS
  ) {
    res.status(429).json({ error: "Please wait before requesting another code" });
    return;
  }

  const pepper = configuredSecret("OTP_PEPPER");
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");

  try {
    await sendTwilioOtp(account.contactPhone.trim(), code);
  } catch (error) {
    req.log.error(
      { error: error instanceof Error ? error.message : "Unknown Twilio error" },
      "Unable to send tracking OTP",
    );
    res.status(502).json({ error: "Unable to send verification code" });
    return;
  }

  await db.insert(trackingOtpsTable).values({
    id: randomUUID(),
    claimId: claim.id,
    codeHash: hashOtp(trackingCode, code, pepper).toString("hex"),
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
  });

  res.status(202).json(genericSendResponse);
});

router.post("/public/track/:trackingCode/verify-otp", async (req, res): Promise<void> => {
  const trackingCode = normalizedTrackingCode(req.params.trackingCode);
  const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";

  if (!/^\d{6}$/.test(code)) {
    res.status(400).json({ error: "A six-digit verification code is required" });
    return;
  }

  const [claim] = await db
    .select({ id: claimsTable.id })
    .from(claimsTable)
    .where(eq(claimsTable.trackingCode, trackingCode))
    .limit(1);

  if (!claim) {
    res.status(401).json({ error: "Invalid or expired verification code" });
    return;
  }

  const pepper = configuredSecret("OTP_PEPPER");
  const verified = await db.transaction(async (tx) => {
    const [otp] = await tx
      .select()
      .from(trackingOtpsTable)
      .where(
        and(
          eq(trackingOtpsTable.claimId, claim.id),
          isNull(trackingOtpsTable.usedAt),
          lt(trackingOtpsTable.attempts, OTP_MAX_ATTEMPTS),
        ),
      )
      .orderBy(desc(trackingOtpsTable.createdAt))
      .limit(1)
      .for("update");

    if (!otp || otp.expiresAt.getTime() <= Date.now()) {
      return false;
    }

    const expected = Buffer.from(otp.codeHash, "hex");
    const supplied = hashOtp(trackingCode, code, pepper);
    const matches =
      expected.length === supplied.length && timingSafeEqual(expected, supplied);

    await tx
      .update(trackingOtpsTable)
      .set({
        attempts: otp.attempts + 1,
        usedAt: matches ? new Date() : null,
      })
      .where(eq(trackingOtpsTable.id, otp.id));

    return matches;
  });

  if (!verified) {
    res.status(401).json({ error: "Invalid or expired verification code" });
    return;
  }

  const result = await getPublicTrackingResult(trackingCode);
  if (!result) {
    res.status(404).json({ error: "Tracking record not found" });
    return;
  }

  res.json({ verified: true, tracking: result });
});

export default router;