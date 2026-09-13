import { Router, type IRouter } from "express";
import { clerkClient } from "@clerk/express";
import { and, asc, desc, eq, ilike, inArray, or } from "drizzle-orm";
import {
  appointmentHistoryTable,
  appointmentsTable,
  claimHistoryTable,
  claimsTable,
  communityOwnershipTable,
  db,
  locationsTable,
  pickupRequestsTable,
  recipientAccountsTable,
  serviceActivitiesTable,
  stageHistoryTable,
} from "@workspace/db";
import { randomUUID } from "node:crypto";
import { requireCommunity, requireStaff } from "../middlewares/apiKeyAuth";
import { itemRepository } from "../lib/itemRepository";

const router: IRouter = Router();

const OWNERSHIP_TYPES = [
  "account",
  "donation",
  "claim",
  "appointment",
  "pickup_request",
  "service_activity",
] as const;
type OwnershipType = (typeof OWNERSHIP_TYPES)[number];

function isOwnershipType(value: unknown): value is OwnershipType {
  return typeof value === "string" && OWNERSHIP_TYPES.includes(value as OwnershipType);
}

async function ownershipRecordExists(recordType: OwnershipType, recordId: string): Promise<boolean> {
  switch (recordType) {
    case "account":
      return Boolean((await db.select({ id: recipientAccountsTable.id }).from(recipientAccountsTable).where(eq(recipientAccountsTable.id, recordId)).limit(1))[0]);
    case "donation":
      return itemRepository.existsById(recordId);
    case "claim":
      return Boolean((await db.select({ id: claimsTable.id }).from(claimsTable).where(eq(claimsTable.id, recordId)).limit(1))[0]);
    case "appointment":
      return Boolean((await db.select({ id: appointmentsTable.id }).from(appointmentsTable).where(eq(appointmentsTable.id, recordId)).limit(1))[0]);
    case "pickup_request":
      return Boolean((await db.select({ id: pickupRequestsTable.id }).from(pickupRequestsTable).where(eq(pickupRequestsTable.id, recordId)).limit(1))[0]);
    case "service_activity":
      return Boolean((await db.select({ id: serviceActivitiesTable.id }).from(serviceActivitiesTable).where(eq(serviceActivitiesTable.id, recordId)).limit(1))[0]);
  }
}

function idsFor(
  rows: Array<{ recordType: string; recordId: string }>,
  type: OwnershipType,
): string[] {
  return rows.filter((row) => row.recordType === type).map((row) => row.recordId);
}

/**
 * Resolve all record IDs from staff-created ownership links before querying
 * any personal data. Related records are included only through already-owned
 * account, claim, appointment, or item IDs.
 */
export async function getCommunityHistory(clerkUserId: string) {
  const ownership = await db
    .select({
      recordType: communityOwnershipTable.recordType,
      recordId: communityOwnershipTable.recordId,
    })
    .from(communityOwnershipTable)
    .where(eq(communityOwnershipTable.clerkUserId, clerkUserId));

  const accountIds = idsFor(ownership, "account");
  const directDonationIds = idsFor(ownership, "donation");
  const directClaimIds = idsFor(ownership, "claim");
  const directAppointmentIds = idsFor(ownership, "appointment");
  const pickupIds = idsFor(ownership, "pickup_request");
  const directActivityIds = idsFor(ownership, "service_activity");

  const [accountClaims, directClaims, directAppointments, directDonations, pickups] =
    await Promise.all([
      accountIds.length
        ? db.select().from(claimsTable).where(inArray(claimsTable.accountId, accountIds))
        : Promise.resolve([]),
      directClaimIds.length
        ? db.select().from(claimsTable).where(inArray(claimsTable.id, directClaimIds))
        : Promise.resolve([]),
      directAppointmentIds.length
        ? db.select().from(appointmentsTable).where(inArray(appointmentsTable.id, directAppointmentIds))
        : Promise.resolve([]),
      directDonationIds.length
        ? itemRepository.findByIds(directDonationIds)
        : Promise.resolve([]),
      pickupIds.length
        ? db.select().from(pickupRequestsTable).where(inArray(pickupRequestsTable.id, pickupIds))
        : Promise.resolve([]),
    ]);

  const claimsById = new Map([...accountClaims, ...directClaims].map((claim) => [claim.id, claim]));
  const claims = Array.from(claimsById.values()).sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
  );
  const claimIds = claims.map((claim) => claim.id);
  const claimItemIds = claims.map((claim) => claim.itemId);

  const [claimAppointments, claimDonations, claimHistoryResult, donationHistory] = await Promise.all([
    claimIds.length
      ? db.select().from(appointmentsTable).where(inArray(appointmentsTable.relatedClaimId, claimIds))
      : Promise.resolve([]),
      claimItemIds.length
        ? itemRepository.findByIds(claimItemIds)
      : Promise.resolve([]),
    claimIds.length
      ? db.select().from(claimHistoryTable)
          .where(inArray(claimHistoryTable.claimId, claimIds))
          .orderBy(asc(claimHistoryTable.timestamp))
      : Promise.resolve([]),
    claimItemIds.length
      ? db.select().from(stageHistoryTable)
          .where(inArray(stageHistoryTable.itemId, claimItemIds))
          .orderBy(asc(stageHistoryTable.timestamp))
      : Promise.resolve([]),
  ]);
  const claimHistory: Array<typeof claimHistoryTable.$inferSelect> = claimHistoryResult;

  const appointmentsById = new Map(
    [...directAppointments, ...claimAppointments].map((appointment) => [appointment.id, appointment]),
  );
  const appointments = Array.from(appointmentsById.values()).sort(
    (a, b) => b.scheduledStart.getTime() - a.scheduledStart.getTime(),
  );
  const appointmentIds = appointments.map((appointment) => appointment.id);
  const appointmentHistory: Array<typeof appointmentHistoryTable.$inferSelect> = appointmentIds.length
    ? await db.select().from(appointmentHistoryTable)
        .where(inArray(appointmentHistoryTable.appointmentId, appointmentIds))
        .orderBy(asc(appointmentHistoryTable.timestamp))
    : [];

  const donationsById = new Map(
    [...directDonations, ...claimDonations].map((donation) => [donation.id, donation]),
  );
  const donations = Array.from(donationsById.values()).sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
  const donationIds = donations.map((donation) => donation.id);

  const relatedActivityConditions = [
    accountIds.length ? inArray(serviceActivitiesTable.relatedAccountId, accountIds) : undefined,
    claimIds.length ? inArray(serviceActivitiesTable.relatedClaimId, claimIds) : undefined,
    donationIds.length ? inArray(serviceActivitiesTable.relatedItemId, donationIds) : undefined,
    appointmentIds.length ? inArray(serviceActivitiesTable.relatedAppointmentId, appointmentIds) : undefined,
    pickupIds.length ? inArray(serviceActivitiesTable.relatedPickupId, pickupIds) : undefined,
    directActivityIds.length ? inArray(serviceActivitiesTable.id, directActivityIds) : undefined,
  ].filter(Boolean);
  const activities = relatedActivityConditions.length
    ? await db.select().from(serviceActivitiesTable)
        .where(relatedActivityConditions.length === 1 ? relatedActivityConditions[0] : or(...relatedActivityConditions))
        .orderBy(desc(serviceActivitiesTable.createdAt))
    : [];

  const locations = appointments.length
    ? await db.select().from(locationsTable)
        .where(inArray(locationsTable.id, appointments.map((appointment) => appointment.locationId)))
    : [];
  const locationById = new Map(locations.map((location) => [location.id, location]));
  const history = [
    ...claimHistory.map((entry) => ({
      recordType: "claim" as const,
      recordId: entry.claimId,
      label: entry.toStatus,
      status: entry.toStatus,
      timestamp: entry.timestamp,
    })),
    ...donationHistory.map((entry) => ({
      recordType: "donation" as const,
      recordId: entry.itemId,
      label: `Donation ${entry.toStage}`,
      status: entry.toStage,
      timestamp: entry.timestamp,
    })),
    ...appointmentHistory.map((entry) => ({
      recordType: "appointment" as const,
      recordId: entry.appointmentId,
      label: `Appointment ${entry.toStatus}`,
      status: entry.toStatus,
      timestamp: entry.timestamp,
    })),
    ...activities.map((activity) => ({
      recordType: "service_activity" as const,
      recordId: activity.id,
      label: activity.publicSafeSummary ?? activity.activityType,
      status: activity.status,
      timestamp: activity.createdAt,
    })),
  ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  return {
    donations: donations.map((donation) => ({
      id: donation.id,
      itemId: donation.itemId,
      name: donation.name,
      category: donation.category,
      stage: donation.stage,
      createdAt: donation.createdAt,
      updatedAt: donation.updatedAt,
    })),
    claims: claims.map((claim) => ({
      id: claim.id,
      trackingCode: claim.trackingCode,
      itemId: claim.itemId,
      status: claim.status,
      createdAt: claim.createdAt,
      updatedAt: claim.updatedAt,
      history: claimHistory
        .filter((entry) => entry.claimId === claim.id)
        .map((entry) => ({
          id: entry.id,
          fromStatus: entry.fromStatus,
          toStatus: entry.toStatus,
          timestamp: entry.timestamp,
        })),
    })),
    appointments: appointments.map((appointment) => ({
      id: appointment.id,
      appointmentType: appointment.appointmentType,
      relatedClaimId: appointment.relatedClaimId,
      relatedItemId: appointment.relatedItemId,
      scheduledStart: appointment.scheduledStart,
      scheduledEnd: appointment.scheduledEnd,
      status: appointment.status,
      createdAt: appointment.createdAt,
      updatedAt: appointment.updatedAt,
      station: locationById.get(appointment.locationId)
        ? {
            id: locationById.get(appointment.locationId)!.id,
            code: locationById.get(appointment.locationId)!.code,
            zone: locationById.get(appointment.locationId)!.zone,
          }
        : null,
      history: appointmentHistory
        .filter((entry) => entry.appointmentId === appointment.id)
        .map((entry) => ({
          id: entry.id,
          fromStatus: entry.fromStatus,
          toStatus: entry.toStatus,
          timestamp: entry.timestamp,
        })),
    })),
    reservations: appointments
      .filter((appointment) => appointment.appointmentType === "reserve_item_pickup")
      .map((appointment) => ({
        id: appointment.id,
        status: appointment.status,
        scheduledStart: appointment.scheduledStart,
        scheduledEnd: appointment.scheduledEnd,
        relatedClaimId: appointment.relatedClaimId,
      })),
    volunteerRequests: appointments
      .filter((appointment) => appointment.appointmentType === "volunteer_shift")
      .map((appointment) => ({
        id: appointment.id,
        status: appointment.status,
        scheduledStart: appointment.scheduledStart,
        scheduledEnd: appointment.scheduledEnd,
      })),
    pickups: pickups.map((pickup) => ({
      id: pickup.id,
      status: pickup.status,
      requestedWindow: pickup.requestedWindow,
      confirmedDatetime: pickup.confirmedDatetime,
      createdAt: pickup.createdAt,
      updatedAt: pickup.updatedAt,
    })),
    acknowledgments: activities
      .filter((activity) => activity.activityType === "acknowledgment")
      .map((activity) => ({
        id: activity.id,
        status: activity.status,
        summary: activity.publicSafeSummary,
        createdAt: activity.createdAt,
        completedAt: activity.completedAt,
      })),
    history,
    ownership: {
      linkedRecords: ownership.length,
      staffMediated: true,
    },
  };
}

router.get("/community/history", requireCommunity, async (req, res): Promise<void> => {
  const userId = res.locals.staffUserId ?? res.locals.communityUserId;
  if (!userId) {
    res.status(401).json({ error: "Community sign-in required" });
    return;
  }
  res.json(await getCommunityHistory(userId));
});

router.get("/community/ownership", requireStaff, async (req, res): Promise<void> => {
  const clerkUserId = String(req.query.clerkUserId ?? "").trim();
  if (!clerkUserId) {
    res.status(400).json({ error: "Clerk user ID is required" });
    return;
  }
  const links = await db.select().from(communityOwnershipTable)
    .where(eq(communityOwnershipTable.clerkUserId, clerkUserId))
    .orderBy(desc(communityOwnershipTable.verifiedAt));
  res.json(links);
});

router.get("/community/ownership/candidates", requireStaff, async (req, res): Promise<void> => {
  const recordType = req.query.recordType;
  const search = String(req.query.search ?? "").trim();
  if (!isOwnershipType(recordType)) {
    res.status(400).json({ error: "A valid record type is required" });
    return;
  }
  const pattern = `%${search}%`;
  switch (recordType) {
    case "account": {
      const rows = await db.select({ id: recipientAccountsTable.id, label: recipientAccountsTable.name, detail: recipientAccountsTable.type })
        .from(recipientAccountsTable)
        .where(search ? or(ilike(recipientAccountsTable.id, pattern), ilike(recipientAccountsTable.name, pattern)) : undefined)
        .orderBy(asc(recipientAccountsTable.name)).limit(50);
      res.json(rows);
      return;
    }
    case "donation": {
      const rows = await itemRepository.searchResults(search, 50);
      res.json(rows);
      return;
    }
    case "claim": {
      const rows = await db.select({ id: claimsTable.id, label: claimsTable.trackingCode, detail: claimsTable.status })
        .from(claimsTable)
        .where(search ? or(ilike(claimsTable.id, pattern), ilike(claimsTable.trackingCode, pattern)) : undefined)
        .orderBy(desc(claimsTable.createdAt)).limit(50);
      res.json(rows.map((row) => ({ ...row, label: row.label ?? `Claim ${row.id.slice(0, 8)}` })));
      return;
    }
    case "appointment": {
      const rows = await db.select({ id: appointmentsTable.id, label: appointmentsTable.contactName, detail: appointmentsTable.status })
        .from(appointmentsTable)
        .where(search ? or(ilike(appointmentsTable.id, pattern), ilike(appointmentsTable.contactName, pattern)) : undefined)
        .orderBy(desc(appointmentsTable.createdAt)).limit(50);
      res.json(rows.map((row) => ({ ...row, label: row.label ?? `Appointment ${row.id.slice(0, 8)}` })));
      return;
    }
    case "pickup_request": {
      const rows = await db.select({ id: pickupRequestsTable.id, label: pickupRequestsTable.name, detail: pickupRequestsTable.status })
        .from(pickupRequestsTable)
        .where(search ? or(ilike(pickupRequestsTable.id, pattern), ilike(pickupRequestsTable.name, pattern)) : undefined)
        .orderBy(desc(pickupRequestsTable.createdAt)).limit(50);
      res.json(rows.map((row) => ({ ...row, label: row.label ?? `Pickup ${row.id.slice(0, 8)}` })));
      return;
    }
    case "service_activity": {
      const rows = await db.select({ id: serviceActivitiesTable.id, label: serviceActivitiesTable.activityType, detail: serviceActivitiesTable.status })
        .from(serviceActivitiesTable)
        .where(search ? or(ilike(serviceActivitiesTable.id, pattern), ilike(serviceActivitiesTable.activityType, pattern)) : undefined)
        .orderBy(desc(serviceActivitiesTable.createdAt)).limit(50);
      res.json(rows);
      return;
    }
  }
});

/**
 * Staff can establish ownership only after identity verification outside the
 * public tracking flow. Community users cannot create or alter these links.
 */
router.post("/community/ownership", requireStaff, async (req, res): Promise<void> => {
  const clerkUserId = String(req.body?.clerkUserId ?? "").trim();
  const recordType = req.body?.recordType;
  const recordId = String(req.body?.recordId ?? "").trim();
  if (!clerkUserId || !isOwnershipType(recordType) || !recordId) {
    res.status(400).json({ error: "User, record type, and record ID are required" });
    return;
  }
  if (!(await ownershipRecordExists(recordType, recordId))) {
    res.status(404).json({ error: "The record to link was not found" });
    return;
  }
  try {
    const user = await clerkClient.users.getUser(clerkUserId);
    if (user.publicMetadata.role !== "community") {
      res.status(400).json({ error: "The Clerk user is not a community account" });
      return;
    }
  } catch {
    res.status(404).json({ error: "The Clerk user was not found" });
    return;
  }

  const verifiedBy = res.locals.authMethod === "api-key"
    ? "api-key"
    : (res.locals.staffUserId ?? "staff");
  const [link] = await db.insert(communityOwnershipTable).values({
    id: randomUUID(),
    clerkUserId,
    recordType,
    recordId,
    verifiedBy,
  }).onConflictDoNothing().returning();
  if (!link) {
    res.status(409).json({ error: "That record is already linked to an account" });
    return;
  }
  res.status(201).json(link);
});

router.delete("/community/ownership/:id", requireStaff, async (req, res): Promise<void> => {
  const ownershipId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [deleted] = await db.delete(communityOwnershipTable)
    .where(eq(communityOwnershipTable.id, ownershipId))
    .returning({ id: communityOwnershipTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Ownership link not found" });
    return;
  }
  res.status(204).end();
});

export default router;