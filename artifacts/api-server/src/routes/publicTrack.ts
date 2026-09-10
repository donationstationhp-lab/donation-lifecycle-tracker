import { Router, type IRouter } from "express";
import { and, asc, eq } from "drizzle-orm";
import {
  claimHistoryTable,
  claimsTable,
  db,
  donationItemsTable,
  ensureClaimTrackingCodes,
  transfersTable,
  appointmentsTable,
  appointmentHistoryTable,
  serviceActivitiesTable,
} from "@workspace/db";
import { publicItemStageLabel } from "../lib/itemLifecycle";
import {
  GetPublicImpactSummaryResponse,
  GetPublicTrackingResponse,
} from "@workspace/api-zod";
import { buildPublicActivityTimeline } from "../lib/publicServiceActivity";
import { safeCategory, safeItemName } from "../lib/publicItemLabels";

const router: IRouter = Router();
const PUBLIC_TIME_ZONE = "America/Chicago";

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
    lastUpdatedExact: null,
    timeline: history.map((entry) => ({
      label: entry.label ?? publicClaimStatusLabel(entry.status ?? ""),
      approx: approximateTimestamp(entry.timestamp),
      exact: null,
    })),
    exactTimesLocked: true,
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

router.get("/public/track/:trackingCode", async (req, res): Promise<void> => {
  const trackingCode = normalizedTrackingCode(req.params.trackingCode);
  if (!/^DSC-\d{6}$/.test(trackingCode)) {
    res.status(404).json({ error: "Tracking record not found" });
    return;
  }

  await ensureClaimTrackingCodes();

  const [result] = await db
    .select({
      claimId: claimsTable.id,
      trackingCode: claimsTable.trackingCode,
      status: claimsTable.status,
      updatedAt: claimsTable.updatedAt,
      itemName: donationItemsTable.name,
      itemCategory: donationItemsTable.category,
      itemStage: donationItemsTable.stage,
    })
    .from(claimsTable)
    .innerJoin(donationItemsTable, eq(claimsTable.itemId, donationItemsTable.id))
    .where(eq(claimsTable.trackingCode, trackingCode))
    .limit(1);

  if (!result?.trackingCode) {
    res.status(404).json({ error: "Tracking record not found" });
    return;
  }

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
  res.json(buildPublicTrackingResponse({
    ...result,
    trackingCode: result.trackingCode,
  }, mergedTimeline.filter((entry) => {
    const label = "label" in entry ? entry.label : publicClaimStatusLabel(entry.status);
    const key = `${label}:${entry.timestamp.toISOString().slice(0, 10)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  })));
});

router.get("/public/impact-summary", async (_req, res): Promise<void> => {
  const [items, claims, history, receivedTransfers] = await Promise.all([
    db.select({
      category: donationItemsTable.category,
      stage: donationItemsTable.stage,
    }).from(donationItemsTable),
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