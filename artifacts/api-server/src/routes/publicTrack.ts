import { Router, type IRouter } from "express";
import { createHash, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { and, asc, desc, eq, gt, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import {
  claimHistoryTable,
  claimsTable,
  db,
  ensureClaimTrackingCodes,
  recipientAccountsTable,
  trackingOtpsTable,
  transfersTable,
  appointmentsTable,
  appointmentHistoryTable,
  serviceActivitiesTable,
} from "@workspace/db";
import { publicItemStageLabel } from "../lib/itemLifecycle";
import {
  GetPublicImpactSummaryResponse,
  GetPublicTrackingResponse,
  RequestPublicTrackingVerificationParams,
  RequestPublicTrackingVerificationResponse,
  VerifyPublicTrackingBody,
  VerifyPublicTrackingParams,
} from "@workspace/api-zod";
import { buildPublicActivityTimeline } from "../lib/publicServiceActivity";
import { safeCategory, safeItemName } from "../lib/publicItemLabels";
import { sendTrackingVerificationSms } from "../lib/twilio";
import { logger } from "../lib/logger";
import { itemRepository } from "../lib/itemRepository";

const router: IRouter = Router();
const PUBLIC_TIME_ZONE = "America/Chicago";
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
export const TRACKING_OTP_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const TRACKING_OTP_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
export const TRACKING_OTP_CLEANUP_BATCH_SIZE = 500;
// Keep public SMS verification off until Trust Hub approval and an explicit
// rollout decision are both recorded in deployment configuration.
const PUBLIC_TRACKING_OTP_ENABLED =
  process.env.PUBLIC_TRACKING_OTP_ENABLED === "true" &&
  process.env.TWILIO_TRUST_HUB_APPROVED === "true";

const PUBLIC_CLAIM_STATUS_LABELS: Record<string, string> = {
  submitted: "Request Received",
  verified: "Eligibility Verified",
  approved: "Claim Approved",
  fulfilled: "Completed",
  rejected: "Request Not Approved",
  cancelled: "Cancelled",
  reservation_requested: "Reserved",
  reservation_confirmed: "Appointment Scheduled",
  reservation_completed: "Pickup Completed",
  reservation_no_show: "No-show",
  reservation_canceled: "Canceled",
};

export function publicClaimStatusLabel(status: string): string {
  return PUBLIC_CLAIM_STATUS_LABELS[status] ?? "In Progress";
}

function normalizedTrackingCode(value: string | string[]): string {
  return (Array.isArray(value) ? value[0] : value).trim().toUpperCase();
}

export { safeCategory, safeItemName } from "../lib/publicItemLabels";

function approximateTimestamp(value: Date): string {
  const date = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: PUBLIC_TIME_ZONE,
  }).format(value);
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: PUBLIC_TIME_ZONE,
    }).format(value),
  );
  const period =
    hour < 5 ? "overnight" :
    hour < 12 ? "morning" :
    hour < 17 ? "afternoon" :
    hour < 21 ? "evening" :
    "night";

  return `${date} (${period})`;
}

interface PublicTrackingSource {
  trackingCode: string;
  status: string;
  updatedAt: Date;
  itemName: string;
  itemCategory: string;
  itemStage: string;
}

interface PublicTimelineSource {
  status?: string;
  label?: string;
  timestamp: Date;
}

interface PublicImpactSource {
  items: Array<{ category: string; stage: string }>;
  claims: Array<{ id: string; status: string }>;
  history: Array<{ claimId: string; status: string; timestamp: Date }>;
  receivedTransfers: Array<{ itemId: string }>;
}

export function buildPublicTrackingResponse(
  source: PublicTrackingSource,
  history: PublicTimelineSource[],
  verified = false,
) {
  return GetPublicTrackingResponse.parse({
    trackingCode: source.trackingCode,
    item: {
      categoryLabel: `${safeCategory(source.itemCategory)} item`,
      name: safeItemName(source.itemName, source.itemCategory),
    },
    stage: publicItemStageLabel(source.itemStage),
    status: publicClaimStatusLabel(source.status),
    lastUpdatedApprox: approximateTimestamp(source.updatedAt),
    lastUpdatedExact: verified ? source.updatedAt.toISOString() : null,
    timeline: history.map((entry) => ({
      label: entry.label ?? publicClaimStatusLabel(entry.status ?? ""),
      approx: approximateTimestamp(entry.timestamp),
      exact: verified ? entry.timestamp.toISOString() : null,
    })),
    exactTimesLocked: !verified,
  });
}

export function buildPublicImpactSummary(source: PublicImpactSource) {
  const categoryCounts = new Map<string, number>();
  for (const item of source.items) {
    const label = safeCategory(item.category);
    categoryCounts.set(label, (categoryCounts.get(label) ?? 0) + 1);
  }

  const fulfillmentTimesByClaim = new Map<
    string,
    { submittedAt?: Date; fulfilledAt?: Date }
  >();
  for (const entry of source.history) {
    const times = fulfillmentTimesByClaim.get(entry.claimId) ?? {};
    if (
      entry.status === "submitted" &&
      (!times.submittedAt || entry.timestamp < times.submittedAt)
    ) {
      times.submittedAt = entry.timestamp;
    }
    if (
      entry.status === "fulfilled" &&
      (!times.fulfilledAt || entry.timestamp < times.fulfilledAt)
    ) {
      times.fulfilledAt = entry.timestamp;
    }
    fulfillmentTimesByClaim.set(entry.claimId, times);
  }

  const fulfillmentHours = Array.from(fulfillmentTimesByClaim.values())
    .filter(
      (times): times is { submittedAt: Date; fulfilledAt: Date } =>
        Boolean(
          times.submittedAt &&
          times.fulfilledAt &&
          times.fulfilledAt >= times.submittedAt,
        ),
    )
    .map(
      ({ submittedAt, fulfilledAt }) =>
        (fulfilledAt.getTime() - submittedAt.getTime()) / 3_600_000,
    );

  return GetPublicImpactSummaryResponse.parse({
    totalItemsReceived: source.items.length,
    totalItemsDistributed: new Set(
      source.receivedTransfers.map((transfer) => transfer.itemId),
    ).size,
    itemsByCategory: Array.from(categoryCounts, ([categoryLabel, count]) => ({
      categoryLabel,
      count,
    })).sort((a, b) => a.categoryLabel.localeCompare(b.categoryLabel)),
    claimsFulfilled: source.claims.filter((claim) => claim.status === "fulfilled").length,
    averageFulfillmentHours: fulfillmentHours.length
      ? Math.round(
          fulfillmentHours.reduce((total, hours) => total + hours, 0) /
            fulfillmentHours.length *
            10,
        ) / 10
      : null,
  });
}

async function findPublicTracking(trackingCode: string) {
  await ensureClaimTrackingCodes();
  const [claim] = await db
    .select({
      claimId: claimsTable.id,
      trackingCode: claimsTable.trackingCode,
      status: claimsTable.status,
      updatedAt: claimsTable.updatedAt,
      itemId: claimsTable.itemId,
    })
    .from(claimsTable)
    .where(eq(claimsTable.trackingCode, trackingCode))
    .limit(1);
  const item = claim ? await itemRepository.getPublicTrackingItem(claim.itemId) : undefined;
  const result = claim && item
    ? {
        claimId: claim.claimId,
        trackingCode: claim.trackingCode,
        status: claim.status,
        updatedAt: claim.updatedAt,
        itemName: item.name,
        itemCategory: item.category,
        itemStage: item.stage,
      }
    : undefined;

  if (!result?.trackingCode) return null;

  const [history, appointmentHistory, activities] = await Promise.all([db
    .select({
      status: claimHistoryTable.toStatus,
      timestamp: claimHistoryTable.timestamp,
    })
    .from(claimHistoryTable)
    .where(eq(claimHistoryTable.claimId, result.claimId))
    .orderBy(asc(claimHistoryTable.timestamp)),
    db.select({
      status: appointmentHistoryTable.toStatus,
      timestamp: appointmentHistoryTable.timestamp,
    }).from(appointmentHistoryTable)
      .innerJoin(appointmentsTable, eq(appointmentHistoryTable.appointmentId, appointmentsTable.id))
      .where(and(
        eq(appointmentsTable.relatedClaimId, result.claimId),
        eq(appointmentsTable.appointmentType, "reserve_item_pickup"),
      ))
      .orderBy(asc(appointmentHistoryTable.timestamp)),
    db.select({
      activityType: serviceActivitiesTable.activityType,
      status: serviceActivitiesTable.status,
      createdAt: serviceActivitiesTable.createdAt,
    }).from(serviceActivitiesTable)
      .where(eq(serviceActivitiesTable.publicTrackingCode, trackingCode))
      .orderBy(asc(serviceActivitiesTable.createdAt)),
  ]);

  const mergedTimeline = [
    ...history,
    ...appointmentHistory.map((entry) => ({
      status: `reservation_${entry.status}`,
      timestamp: entry.timestamp,
    })),
    ...buildPublicActivityTimeline(activities),
  ].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const seen = new Set<string>();
  const timeline = mergedTimeline.filter((entry) => {
    const label = "label" in entry ? entry.label : publicClaimStatusLabel(entry.status);
    const key = `${label}:${entry.timestamp.toISOString().slice(0, 10)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { result, timeline };
}

function hashOtp(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export async function issueTrackingOtp(
  claimId: string,
  code: string,
  now = new Date(),
  otpId = randomUUID(),
): Promise<{ id: string; expiresAt: Date }> {
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS);
  await db.update(trackingOtpsTable)
    .set({ usedAt: now })
    .where(and(
      eq(trackingOtpsTable.claimId, claimId),
      isNull(trackingOtpsTable.usedAt),
    ));
  await db.insert(trackingOtpsTable).values({
    id: otpId,
    claimId,
    codeHash: hashOtp(code),
    expiresAt,
  });
  return { id: otpId, expiresAt };
}

export async function cleanupExpiredTrackingOtps(
  now = new Date(),
  retentionMs = TRACKING_OTP_RETENTION_MS,
  batchSize = TRACKING_OTP_CLEANUP_BATCH_SIZE,
): Promise<number> {
  const retentionCutoff = new Date(now.getTime() - Math.max(0, retentionMs));
  const boundedBatchSize = Math.max(1, Math.floor(batchSize));
  let totalDeletedCount = 0;

  while (true) {
    const deleted = await db.execute<{ id: string }>(sql`
      WITH expired AS (
        SELECT ${trackingOtpsTable.id}
        FROM ${trackingOtpsTable}
        WHERE ${or(
          lt(trackingOtpsTable.expiresAt, retentionCutoff),
          and(
            isNotNull(trackingOtpsTable.usedAt),
            lt(trackingOtpsTable.usedAt, retentionCutoff),
          ),
        )}
        LIMIT ${boundedBatchSize}
        FOR UPDATE SKIP LOCKED
      )
      DELETE FROM ${trackingOtpsTable}
      USING expired
      WHERE ${trackingOtpsTable.id} = expired.id
      RETURNING ${trackingOtpsTable.id}
    `);
    const deletedCount = deleted.rows.length;
    totalDeletedCount += deletedCount;
    const moreWorkRemaining = deletedCount === boundedBatchSize;

    logger.info(
      {
        batchSize: boundedBatchSize,
        deletedCount,
        moreWorkRemaining,
        retentionCutoff: retentionCutoff.toISOString(),
        totalDeletedCount,
      },
      "Public tracking verification cleanup batch completed",
    );

    if (!moreWorkRemaining) return totalDeletedCount;
  }
}

export interface TrackingOtpCleanupWorker {
  stop(): void;
  runNow(): Promise<void>;
}

export function startTrackingOtpCleanupWorker(
  options: {
    intervalMs?: number;
    retentionMs?: number;
    batchSize?: number;
    now?: () => Date;
  } = {},
): TrackingOtpCleanupWorker {
  let running = false;
  let stopped = false;
  const runNow = async (): Promise<void> => {
    if (stopped || running) return;
    running = true;
    try {
      await cleanupExpiredTrackingOtps(
        options.now?.() ?? new Date(),
        options.retentionMs ?? TRACKING_OTP_RETENTION_MS,
        options.batchSize ?? TRACKING_OTP_CLEANUP_BATCH_SIZE,
      );
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : "Unknown verification cleanup error",
        },
        "Public tracking verification cleanup failed",
      );
    } finally {
      running = false;
    }
  };

  const interval = Math.max(
    1,
    options.intervalMs ?? TRACKING_OTP_CLEANUP_INTERVAL_MS,
  );
  const timer = setInterval(() => void runNow(), interval);
  timer.unref();
  void runNow();

  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    },
    runNow,
  };
}

function secondsUntil(date: Date, now = Date.now()): number {
  return Math.max(1, Math.ceil((date.getTime() - now) / 1000));
}

router.get("/public/track/:trackingCode", async (req, res): Promise<void> => {
  const trackingCode = normalizedTrackingCode(req.params.trackingCode);
  if (!/^DSC-\d{6}$/.test(trackingCode)) {
    res.status(404).json({ error: "Tracking record not found" });
    return;
  }

  const tracking = await findPublicTracking(trackingCode);
  if (!tracking) {
    res.status(404).json({ error: "Tracking record not found" });
    return;
  }

  res.json(buildPublicTrackingResponse(
    { ...tracking.result, trackingCode: tracking.result.trackingCode! },
    tracking.timeline,
  ));
});

router.post("/public/track/:trackingCode/verification/request", async (req, res): Promise<void> => {
  if (!PUBLIC_TRACKING_OTP_ENABLED) {
    res.status(503).json({ error: "SMS verification is not currently available" });
    return;
  }
  const params = RequestPublicTrackingVerificationParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ error: "Tracking record not found" });
    return;
  }
  const trackingCode = normalizedTrackingCode(params.data.trackingCode);
  const tracking = await findPublicTracking(trackingCode);
  if (!tracking) {
    res.status(404).json({ error: "Tracking record not found" });
    return;
  }

  const [account] = await db
    .select({ contactPhone: recipientAccountsTable.contactPhone })
    .from(claimsTable)
    .innerJoin(recipientAccountsTable, eq(claimsTable.accountId, recipientAccountsTable.id))
    .where(eq(claimsTable.id, tracking.result.claimId))
    .limit(1);
  if (!account?.contactPhone?.trim()) {
    res.status(400).json({ error: "SMS verification is unavailable for this claim" });
    return;
  }

  const now = new Date();
  const [latestOtp] = await db
    .select({ createdAt: trackingOtpsTable.createdAt })
    .from(trackingOtpsTable)
    .where(eq(trackingOtpsTable.claimId, tracking.result.claimId))
    .orderBy(desc(trackingOtpsTable.createdAt))
    .limit(1);
  if (latestOtp && latestOtp.createdAt.getTime() + OTP_RESEND_COOLDOWN_MS > now.getTime()) {
    const retryAfterSeconds = secondsUntil(
      new Date(latestOtp.createdAt.getTime() + OTP_RESEND_COOLDOWN_MS),
      now.getTime(),
    );
    res.status(429).json({
      error: "Please wait before requesting another code",
      retryAfterSeconds,
    });
    return;
  }

  const code = randomInt(100000, 1000000).toString();
  const { id: otpId } = await issueTrackingOtp(
    tracking.result.claimId,
    code,
    now,
  );

  try {
    await sendTrackingVerificationSms(account.contactPhone, code);
  } catch (error) {
    await db.update(trackingOtpsTable)
      .set({ usedAt: new Date() })
      .where(eq(trackingOtpsTable.id, otpId));
    req.log.error({ err: error }, "Unable to send public tracking verification SMS");
    res.status(503).json({ error: "Verification SMS is temporarily unavailable" });
    return;
  }

  res.json(RequestPublicTrackingVerificationResponse.parse({
    message: "A verification code was sent to the phone on file",
    expiresInSeconds: OTP_TTL_MS / 1000,
  }));
});

router.post("/public/track/:trackingCode/verification/verify", async (req, res): Promise<void> => {
  if (!PUBLIC_TRACKING_OTP_ENABLED) {
    res.status(503).json({ error: "SMS verification is not currently available" });
    return;
  }
  const params = VerifyPublicTrackingParams.safeParse(req.params);
  const body = VerifyPublicTrackingBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Enter the six-digit verification code" });
    return;
  }
  const trackingCode = normalizedTrackingCode(params.data.trackingCode);
  const tracking = await findPublicTracking(trackingCode);
  if (!tracking) {
    res.status(404).json({ error: "Tracking record not found" });
    return;
  }

  const now = new Date();
  const [otp] = await db
    .select()
    .from(trackingOtpsTable)
    .where(and(
      eq(trackingOtpsTable.claimId, tracking.result.claimId),
      isNull(trackingOtpsTable.usedAt),
      gt(trackingOtpsTable.expiresAt, now),
      lt(trackingOtpsTable.attempts, OTP_MAX_ATTEMPTS),
    ))
    .orderBy(desc(trackingOtpsTable.createdAt))
    .limit(1);
  if (!otp) {
    res.status(429).json({
      error: "This code has expired or reached its attempt limit. Request a new code.",
      retryAfterSeconds: 1,
    });
    return;
  }

  const suppliedHash = Buffer.from(hashOtp(body.data.code), "hex");
  const storedHash = Buffer.from(otp.codeHash, "hex");
  const matches = suppliedHash.length === storedHash.length &&
    timingSafeEqual(suppliedHash, storedHash);
  const [attemptedOtp] = await db.update(trackingOtpsTable)
    .set({
      attempts: sql`${trackingOtpsTable.attempts} + 1`,
      ...(matches ? { usedAt: now } : {}),
    })
    .where(and(
      eq(trackingOtpsTable.id, otp.id),
      isNull(trackingOtpsTable.usedAt),
      lt(trackingOtpsTable.attempts, OTP_MAX_ATTEMPTS),
    ))
    .returning({ id: trackingOtpsTable.id });
  if (!attemptedOtp || !matches) {
    res.status(400).json({ error: "That verification code is not valid" });
    return;
  }

  res.json(buildPublicTrackingResponse(
    { ...tracking.result, trackingCode: tracking.result.trackingCode! },
    tracking.timeline,
    true,
  ));
});

router.get("/public/impact-summary", async (_req, res): Promise<void> => {
  const [items, claims, history, receivedTransfers] = await Promise.all([
    itemRepository.listImpactItems(),
    db.select({
      id: claimsTable.id,
      status: claimsTable.status,
    }).from(claimsTable),
    db.select({
      claimId: claimHistoryTable.claimId,
      status: claimHistoryTable.toStatus,
      timestamp: claimHistoryTable.timestamp,
    }).from(claimHistoryTable),
    db.select({
      itemId: transfersTable.itemId,
    }).from(transfersTable).where(eq(transfersTable.status, "received")),
  ]);

  res.json(buildPublicImpactSummary({
    items,
    claims,
    history,
    receivedTransfers,
  }));
});

export default router;