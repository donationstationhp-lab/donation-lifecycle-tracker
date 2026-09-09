import { Router, type IRouter } from "express";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { appointmentsTable, db, pickupRequestsTable, serviceActivitiesTable } from "@workspace/db";
import { recordServiceActivity } from "../lib/serviceActivities";
import { expireStaleReservations } from "./appointments";

const router: IRouter = Router();

router.get("/service-activities", async (req, res) => {
  await expireStaleReservations();
  const rows = await db.select({
    activity: serviceActivitiesTable,
    contactName: sql<string | null>`coalesce(${appointmentsTable.contactName}, ${pickupRequestsTable.name})`,
    contactEmail: appointmentsTable.contactEmail,
    contactPhone: sql<string | null>`coalesce(${appointmentsTable.contactPhone}, ${pickupRequestsTable.phone})`,
    pickupAddress: sql<string | null>`coalesce(${appointmentsTable.pickupAddress}, ${pickupRequestsTable.address})`,
    locationId: appointmentsTable.locationId,
    appointmentType: appointmentsTable.appointmentType,
  }).from(serviceActivitiesTable)
    .leftJoin(appointmentsTable, eq(serviceActivitiesTable.relatedAppointmentId, appointmentsTable.id))
    .leftJoin(pickupRequestsTable, eq(serviceActivitiesTable.relatedPickupId, pickupRequestsTable.id))
    .orderBy(asc(serviceActivitiesTable.createdAt));
  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = row.activity.activityType === "acknowledgment"
      ? `ack:${row.activity.parentActivityId ?? row.activity.id}`
      : row.activity.relatedAppointmentId
        ? `appointment:${row.activity.relatedAppointmentId}`
        : row.activity.relatedPickupId
          ? `pickup:${row.activity.relatedPickupId}`
          : row.activity.activityType === "distribution" && row.activity.relatedClaimId
            ? `distribution:${row.activity.relatedClaimId}`
            : row.activity.relatedClaimId
              ? `${row.activity.activityType}:claim:${row.activity.relatedClaimId}`
              : row.activity.relatedItemId
                ? `${row.activity.activityType}:item:${row.activity.relatedItemId}`
                : row.activity.id;
    const previous = latest.get(key);
    latest.set(key, previous ? {
      ...row,
      activity: {
        ...row.activity,
        scheduledStart: row.activity.scheduledStart ?? previous.activity.scheduledStart,
        scheduledEnd: row.activity.scheduledEnd ?? previous.activity.scheduledEnd,
        staffOwner: row.activity.staffOwner ?? previous.activity.staffOwner,
      },
    } : row);
  }
  const start = req.query.start ? new Date(String(req.query.start)) : null;
  const end = req.query.end ? new Date(String(req.query.end)) : null;
  const filtered = Array.from(latest.values()).filter(({ activity }) =>
    (req.query.scheduled !== "true" || activity.scheduledStart) &&
    (!req.query.activityType || activity.activityType === String(req.query.activityType)) &&
    (!req.query.status || activity.status === String(req.query.status)) &&
    (!req.query.staffOwner || activity.staffOwner === String(req.query.staffOwner)) &&
    (!req.query.relatedItemId || activity.relatedItemId === String(req.query.relatedItemId)) &&
    (!req.query.relatedClaimId || activity.relatedClaimId === String(req.query.relatedClaimId)) &&
    (!start || !!activity.scheduledStart && activity.scheduledStart >= start) &&
    (!end || !!activity.scheduledStart && activity.scheduledStart <= end)
  ).sort((a, b) => (a.activity.scheduledStart?.getTime() ?? 0) - (b.activity.scheduledStart?.getTime() ?? 0));
  res.json(filtered.map(({ activity, ...privateAppointment }) => ({ ...activity, ...privateAppointment })));
});

router.post("/service-activities/acknowledgments/refresh-overdue", async (_req, res) => {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const all = await db.select().from(serviceActivitiesTable)
    .where(eq(serviceActivitiesTable.activityType, "acknowledgment"))
    .orderBy(asc(serviceActivitiesTable.createdAt));
  const latest = new Map<string, (typeof all)[number]>();
  for (const activity of all) latest.set(activity.parentActivityId ?? activity.id, activity);
  const pending = Array.from(latest.values()).filter((activity) =>
    activity.status === "pending" && activity.createdAt <= cutoff);
  let overdue = 0;
  for (const activity of pending) {
    const appended = await db.transaction(async (tx) => {
      const aggregateKey = activity.parentActivityId ?? activity.id;
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${aggregateKey}, 0))`);
      const currentCondition = activity.parentActivityId
        ? eq(serviceActivitiesTable.parentActivityId, activity.parentActivityId)
        : eq(serviceActivitiesTable.id, activity.id);
      const [current] = await tx.select().from(serviceActivitiesTable)
        .where(and(eq(serviceActivitiesTable.activityType, "acknowledgment"), currentCondition))
        .orderBy(desc(serviceActivitiesTable.createdAt)).limit(1);
      if (!current || current.status !== "pending") return false;
      await recordServiceActivity(tx, {
        activityType: "acknowledgment",
        loopStage: "learned",
        relatedItemId: activity.relatedItemId,
        relatedClaimId: activity.relatedClaimId,
        relatedAppointmentId: activity.relatedAppointmentId,
        relatedPickupId: activity.relatedPickupId,
        relatedAccountId: activity.relatedAccountId,
        parentActivityId: activity.parentActivityId,
        publicTrackingCode: activity.publicTrackingCode,
        status: "overdue",
        staffOwner: activity.staffOwner,
        publicSafeSummary: "Acknowledgment overdue",
        internalNotes: "No delivery channel is connected.",
        idempotencyKey: `acknowledgment:${activity.parentActivityId ?? activity.id}:overdue`,
      });
      return true;
    });
    if (appended) overdue += 1;
  }
  res.json({ overdue });
});

router.post("/service-activities/:id/acknowledgment", async (req, res): Promise<void> => {
  const status = String(req.body?.status ?? "");
  if (!["sent", "acknowledged", "completed"].includes(status)) {
    res.status(400).json({ error: "Status must be sent, acknowledged, or completed" });
    return;
  }
  const [source] = await db.select().from(serviceActivitiesTable).where(and(
    eq(serviceActivitiesTable.id, req.params.id),
    eq(serviceActivitiesTable.activityType, "acknowledgment"),
  ));
  if (!source) { res.status(404).json({ error: "Acknowledgment not found" }); return; }
  const created = await db.transaction(async (tx) => {
    const aggregateKey = source.parentActivityId ?? source.id;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${aggregateKey}, 0))`);
    const currentCondition = source.parentActivityId
      ? eq(serviceActivitiesTable.parentActivityId, source.parentActivityId)
      : eq(serviceActivitiesTable.id, source.id);
    const [current] = await tx.select().from(serviceActivitiesTable)
      .where(and(eq(serviceActivitiesTable.activityType, "acknowledgment"), currentCondition))
      .orderBy(desc(serviceActivitiesTable.createdAt)).limit(1);
    if (current?.status === status) return current;
    const id = await recordServiceActivity(tx, {
      activityType: "acknowledgment",
      loopStage: ["acknowledged", "completed"].includes(status) ? "acknowledged" : "verified",
      relatedItemId: current?.relatedItemId ?? source.relatedItemId,
      relatedClaimId: current?.relatedClaimId ?? source.relatedClaimId,
      relatedAppointmentId: current?.relatedAppointmentId ?? source.relatedAppointmentId,
      relatedPickupId: current?.relatedPickupId ?? source.relatedPickupId,
      relatedAccountId: current?.relatedAccountId ?? source.relatedAccountId,
      parentActivityId: source.parentActivityId,
      publicTrackingCode: current?.publicTrackingCode ?? source.publicTrackingCode,
      status,
      staffOwner: res.locals.authMethod === "api-key" ? "api-key" : (res.locals.staffUserId ?? "staff"),
      completedAt: new Date(),
      publicSafeSummary: status === "sent" ? "Acknowledgment sent"
        : status === "completed" ? "Acknowledgment completed"
        : "Acknowledgment recorded",
      idempotencyKey: `acknowledgment:${source.parentActivityId ?? source.id}:${status}`,
    });
    const [row] = await tx.select().from(serviceActivitiesTable).where(eq(serviceActivitiesTable.id, id));
    return row;
  });
  res.status(201).json(created);
});

export default router;