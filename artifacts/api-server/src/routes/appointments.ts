import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, asc, eq, gte, inArray, lt, lte } from "drizzle-orm";
import {
  appointmentHistoryTable,
  appointmentsTable,
  capacitySlotsTable,
  claimsTable,
  db,
  locationsTable,
  stageHistoryTable,
  transferHistoryTable,
  transfersTable,
} from "@workspace/db";
import { recordAcknowledgment, recordServiceActivity } from "../lib/serviceActivities";
import { itemRepository } from "../lib/itemRepository";

export const APPOINTMENT_TYPES = [
  "donation_dropoff",
  "donation_pickup",
  "receiver_pickup",
  "reserve_item_pickup",
  "volunteer_shift",
  "donation_market",
  "barter_handoff",
  "escrow_dropoff",
  "escrow_pickup",
] as const;
const STATUSES = ["requested", "confirmed", "in_progress", "completed", "canceled", "no_show"] as const;
const ACTIVE_STATUSES = ["requested", "confirmed", "in_progress"];
const PUBLIC_TYPES = APPOINTMENT_TYPES.slice(0, 6);
const STATUS_TRANSITIONS: Record<string, string[]> = {
  requested: ["confirmed", "canceled"],
  confirmed: ["in_progress", "canceled", "no_show"],
  in_progress: ["completed", "canceled", "no_show"],
  completed: [],
  canceled: [],
  no_show: [],
};
function activityTypeForAppointment(type: string) {
  if (type === "reserve_item_pickup") return "item_reservation";
  if (type === "volunteer_shift") return "volunteer_shift";
  if (type === "barter_handoff") return "barter_handoff";
  if (type === "donation_dropoff" || type === "escrow_dropoff") return "dropoff";
  if (type === "donation_pickup" || type === "receiver_pickup" || type === "escrow_pickup") return "pickup";
  return "appointment";
}

function isType(value: unknown): value is typeof APPOINTMENT_TYPES[number] {
  return typeof value === "string" && APPOINTMENT_TYPES.includes(value as never);
}
function isStatus(value: unknown): value is typeof STATUSES[number] {
  return typeof value === "string" && STATUSES.includes(value as never);
}
function publicAppointment(row: typeof appointmentsTable.$inferSelect, location: typeof locationsTable.$inferSelect) {
  return {
    id: row.id,
    appointmentType: row.appointmentType,
    station: { id: location.id, code: location.code, zone: location.zone },
    scheduledStart: row.scheduledStart,
    scheduledEnd: row.scheduledEnd,
    status: row.status,
    publicTrackingCode: row.publicTrackingCode,
  };
}

export const publicAppointmentsRouter: IRouter = Router();
export const appointmentsRouter: IRouter = Router();

export async function expireStaleReservations(): Promise<number> {
  const stale = await db.select({ id: appointmentsTable.id }).from(appointmentsTable)
    .where(and(
      eq(appointmentsTable.appointmentType, "reserve_item_pickup"),
      inArray(appointmentsTable.status, ACTIVE_STATUSES),
      lt(appointmentsTable.reservationExpiresAt, new Date()),
    ));
  let expired = 0;
  for (const candidate of stale) {
    const changed = await db.transaction(async (tx) => {
      const [appointment] = await tx.select().from(appointmentsTable)
        .where(eq(appointmentsTable.id, candidate.id)).for("update");
      if (!appointment || !ACTIVE_STATUSES.includes(appointment.status) ||
          !appointment.reservationExpiresAt || appointment.reservationExpiresAt > new Date()) return false;
      if (appointment.relatedTransferId) {
        const [transfer] = await tx.select().from(transfersTable)
          .where(eq(transfersTable.id, appointment.relatedTransferId)).for("update");
        if (!transfer || transfer.status !== "planned") return false;
        const [cancelled] = await tx.update(transfersTable).set({ status: "cancelled", updatedAt: new Date() })
          .where(and(eq(transfersTable.id, transfer.id), eq(transfersTable.status, "planned"))).returning();
        if (!cancelled) return false;
        await tx.insert(transferHistoryTable).values({
          id: randomUUID(), transferId: transfer.id, fromStatus: "planned",
          toStatus: "cancelled", by: "reservation-expiry", notes: "Reservation expired",
        });
        await recordServiceActivity(tx, {
          activityType: "distribution",
          loopStage: "learned",
          relatedItemId: transfer.itemId,
          relatedClaimId: transfer.claimId,
          relatedAccountId: transfer.accountId,
          publicTrackingCode: appointment.publicTrackingCode,
          status: "cancelled",
          completedAt: new Date(),
          publicSafeSummary: "Distribution canceled",
          internalNotes: "Reservation expired",
          idempotencyKey: `transfer:${transfer.id}:cancelled`,
        });
        const restored = await itemRepository.forTransaction(tx).updateStage(
          transfer.itemId,
          "scheduled",
          "matched",
          { updatedAt: new Date() },
        );
        if (!restored) throw new Error("Expired reservation item stage changed");
        await tx.insert(stageHistoryTable).values({
          id: randomUUID(), itemId: transfer.itemId, fromStage: "scheduled",
          toStage: "matched", notes: `Reserve pickup appointment ${appointment.id} expired`,
        });
      }
      await tx.update(appointmentsTable).set({
        status: "canceled", cancelReason: "Reservation expired", updatedAt: new Date(),
      }).where(eq(appointmentsTable.id, appointment.id));
      await tx.insert(appointmentHistoryTable).values({
        id: randomUUID(), appointmentId: appointment.id, fromStatus: appointment.status,
        toStatus: "canceled", by: "reservation-expiry", notes: "Reservation expired",
      });
      await recordServiceActivity(tx, {
        activityType: "item_reservation",
        loopStage: "learned",
        relatedItemId: appointment.relatedItemId,
        relatedClaimId: appointment.relatedClaimId,
        relatedAppointmentId: appointment.id,
        relatedAccountId: appointment.accountId,
        publicTrackingCode: appointment.publicTrackingCode,
        status: "expired",
        scheduledStart: appointment.scheduledStart,
        scheduledEnd: appointment.scheduledEnd,
        completedAt: new Date(),
        publicSafeSummary: "Reservation expired",
        internalNotes: "Expired automatically by reservation policy.",
        idempotencyKey: `appointment:${appointment.id}:expired`,
      });
      return true;
    });
    if (changed) expired += 1;
  }
  return expired;
}

publicAppointmentsRouter.get("/public/capacity-slots", async (req, res) => {
  const type = req.query.appointmentType;
  const now = new Date();
  const slots = await db.select({
    slot: capacitySlotsTable,
    location: locationsTable,
  }).from(capacitySlotsTable)
    .innerJoin(locationsTable, eq(capacitySlotsTable.locationId, locationsTable.id))
    .where(and(
      eq(capacitySlotsTable.status, "open"),
      gte(capacitySlotsTable.scheduledStart, now),
      type && isType(type) ? eq(capacitySlotsTable.appointmentType, type) : undefined,
    ))
    .orderBy(asc(capacitySlotsTable.scheduledStart));
  const bookings = await db.select({
    slotId: appointmentsTable.capacitySlotId,
  }).from(appointmentsTable).where(inArray(appointmentsTable.status, ACTIVE_STATUSES));
  const counts = new Map<string, number>();
  for (const booking of bookings) {
    if (booking.slotId) counts.set(booking.slotId, (counts.get(booking.slotId) ?? 0) + 1);
  }
  res.json(slots.filter(({ slot }) =>
    (!slot.bookingCutoff || slot.bookingCutoff > now) &&
    (counts.get(slot.id) ?? 0) < slot.maxBookings
  ).map(({ slot, location }) => ({
    id: slot.id,
    appointmentType: slot.appointmentType,
    station: { id: location.id, code: location.code, zone: location.zone },
    scheduledStart: slot.scheduledStart,
    scheduledEnd: slot.scheduledEnd,
    spotsAvailable: slot.maxBookings - (counts.get(slot.id) ?? 0),
  })));
});

publicAppointmentsRouter.post("/public/appointments", async (req, res): Promise<void> => {
  const { appointmentType, capacitySlotId, contactName, contactEmail, contactPhone, pickupAddress, trackingCode } = req.body ?? {};
  if (!isType(appointmentType) || !PUBLIC_TYPES.includes(appointmentType)) {
    res.status(400).json({ error: "Unsupported appointment type" }); return;
  }
  if (!capacitySlotId || !contactName?.trim() || (!contactEmail?.trim() && !contactPhone?.trim())) {
    res.status(400).json({ error: "Slot, name, and email or phone are required" }); return;
  }
  if (appointmentType === "reserve_item_pickup" && !trackingCode?.trim()) {
    res.status(400).json({ error: "A claim tracking code is required" }); return;
  }
  try {
    const appointment = await db.transaction(async (tx) => {
      const [slot] = await tx.select().from(capacitySlotsTable)
        .where(eq(capacitySlotsTable.id, String(capacitySlotId))).for("update");
      if (!slot || slot.status !== "open" || slot.appointmentType !== appointmentType ||
          slot.scheduledStart <= new Date() || (slot.bookingCutoff && slot.bookingCutoff <= new Date())) {
        throw new Error("SLOT_UNAVAILABLE");
      }
      const active = await tx.select({ id: appointmentsTable.id }).from(appointmentsTable)
        .where(and(eq(appointmentsTable.capacitySlotId, slot.id), inArray(appointmentsTable.status, ACTIVE_STATUSES)));
      if (active.length >= slot.maxBookings) throw new Error("SLOT_FULL");

      const id = randomUUID();
      const [created] = await tx.insert(appointmentsTable).values({
        id, appointmentType, locationId: slot.locationId,
        scheduledStart: slot.scheduledStart, scheduledEnd: slot.scheduledEnd,
        capacitySlotId: slot.id, status: "requested",
        contactName: String(contactName).trim(),
        contactEmail: contactEmail?.trim() || null,
        contactPhone: contactPhone?.trim() || null,
        pickupAddress: appointmentType === "donation_pickup" ? pickupAddress?.trim() || null : null,
        publicTrackingCode: null,
        requestedTrackingCode: appointmentType === "reserve_item_pickup"
          ? String(trackingCode).trim().toUpperCase()
          : null,
        internalNotes: appointmentType === "reserve_item_pickup" && trackingCode?.trim()
          ? "Public requester supplied a tracking code; staff must verify and link the claim."
          : null,
        reservationExpiresAt: appointmentType === "reserve_item_pickup" ? slot.scheduledEnd : null,
      }).returning();
      await tx.insert(appointmentHistoryTable).values({
        id: randomUUID(), appointmentId: id, fromStatus: null,
        toStatus: "requested", by: "public-booking", notes: "Public booking request",
      });
      await recordServiceActivity(tx, {
        activityType: activityTypeForAppointment(appointmentType),
        loopStage: "received",
        relatedAppointmentId: id,
        status: "requested",
        scheduledStart: slot.scheduledStart,
        scheduledEnd: slot.scheduledEnd,
        publicSafeSummary: "Appointment request received",
        internalNotes: "Created through public scheduling.",
        idempotencyKey: `appointment:${id}:requested`,
      });
      return created;
    });
    const [location] = await db.select().from(locationsTable).where(eq(locationsTable.id, appointment.locationId));
    res.status(201).json(publicAppointment(appointment, location));
  } catch (error) {
    res.status(409).json({ error: "Appointment request could not be completed" });
  }
});

appointmentsRouter.get("/appointments", async (req, res) => {
  await expireStaleReservations();
  const conditions = [
    req.query.status && isStatus(req.query.status) ? eq(appointmentsTable.status, req.query.status) : undefined,
    req.query.appointmentType && isType(req.query.appointmentType) ? eq(appointmentsTable.appointmentType, req.query.appointmentType) : undefined,
    req.query.start ? gte(appointmentsTable.scheduledStart, new Date(String(req.query.start))) : undefined,
    req.query.end ? lte(appointmentsTable.scheduledStart, new Date(String(req.query.end))) : undefined,
  ];
  const rows = await db.select().from(appointmentsTable)
    .where(and(...conditions)).orderBy(asc(appointmentsTable.scheduledStart));
  res.json(rows);
});

appointmentsRouter.get("/appointments/:id", async (req, res): Promise<void> => {
  const [appointment] = await db.select().from(appointmentsTable).where(eq(appointmentsTable.id, req.params.id));
  if (!appointment) { res.status(404).json({ error: "Appointment not found" }); return; }
  const history = await db.select().from(appointmentHistoryTable)
    .where(eq(appointmentHistoryTable.appointmentId, appointment.id))
    .orderBy(asc(appointmentHistoryTable.timestamp));
  res.json({ ...appointment, history });
});

appointmentsRouter.patch("/appointments/:id/status", async (req, res): Promise<void> => {
  const { status, reason, staffAssigned, internalNotes } = req.body ?? {};
  if (!isStatus(status)) { res.status(400).json({ error: "Invalid status" }); return; }
  if ((status === "canceled" || status === "no_show") && !reason?.trim()) {
    res.status(400).json({ error: "A reason is required" }); return;
  }
  try {
  const updated = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(appointmentsTable)
      .where(eq(appointmentsTable.id, req.params.id)).for("update");
    if (!current) return null;
    if (!STATUS_TRANSITIONS[current.status]?.includes(status)) {
      throw new Error(`Invalid appointment transition: ${current.status} to ${status}`);
    }
    if (
      status === "confirmed" &&
      current.appointmentType === "reserve_item_pickup" &&
      current.reservationExpiresAt &&
      current.reservationExpiresAt <= new Date()
    ) {
      throw new Error("Expired reservation cannot be confirmed");
    }
    let relatedTransferId = current.relatedTransferId;
    if (
      status === "confirmed" &&
      current.appointmentType === "reserve_item_pickup" &&
      !relatedTransferId
    ) {
      if (!current.relatedClaimId || !current.relatedItemId || !current.accountId) {
        throw new Error("Reservation is missing its claim or item");
      }
      const [claim] = await tx.select().from(claimsTable)
        .where(eq(claimsTable.id, current.relatedClaimId)).for("update");
      const item = await itemRepository.forTransaction(tx).getById(
        current.relatedItemId!,
        { forUpdate: true },
      );
      if (!claim || claim.status !== "approved" || !item || item.stage !== "matched") {
        throw new Error("Reserve pickup requires an approved claim and matched item");
      }
      relatedTransferId = randomUUID();
      await tx.insert(transfersTable).values({
        id: relatedTransferId, claimId: claim.id, accountId: current.accountId,
        itemId: item.id, status: "planned", notes: `Created from appointment ${current.id}`,
      });
      await tx.insert(transferHistoryTable).values({
        id: randomUUID(), transferId: relatedTransferId, fromStatus: null,
        toStatus: "planned", by: "appointment-confirmation",
      });
      await itemRepository.forTransaction(tx).updateById(item.id, {
        stage: "scheduled",
        updatedAt: new Date(),
      });
      await tx.insert(stageHistoryTable).values({
        id: randomUUID(), itemId: item.id, fromStage: "matched",
        toStage: "scheduled", notes: `Reserve pickup appointment ${current.id} confirmed`,
      });
      await recordServiceActivity(tx, {
        activityType: "distribution", loopStage: "scheduled",
        relatedItemId: item.id, relatedClaimId: claim.id, relatedAccountId: current.accountId,
        publicTrackingCode: claim.trackingCode, status: "planned",
        scheduledStart: current.scheduledStart, scheduledEnd: current.scheduledEnd,
        publicSafeSummary: "Distribution scheduled",
        internalNotes: `Created from appointment ${current.id}`,
        idempotencyKey: `transfer:${relatedTransferId}:planned`,
      });
    }
    if (
      (status === "canceled" || status === "no_show") &&
      current.appointmentType === "reserve_item_pickup" &&
      relatedTransferId
    ) {
      const [transfer] = await tx.select().from(transfersTable)
        .where(eq(transfersTable.id, relatedTransferId)).for("update");
      if (transfer?.status === "planned") {
        await tx.update(transfersTable).set({ status: "cancelled", updatedAt: new Date() })
          .where(eq(transfersTable.id, transfer.id));
        await tx.insert(transferHistoryTable).values({
          id: randomUUID(), transferId: transfer.id, fromStatus: "planned",
          toStatus: "cancelled", by: "appointment-cancellation", notes: reason.trim(),
        });
        const restored = await itemRepository.forTransaction(tx).updateStage(
          transfer.itemId,
          "scheduled",
          "matched",
          { updatedAt: new Date() },
        );
        if (!restored) throw new Error("Item stage changed before reservation release");
        await tx.insert(stageHistoryTable).values({
          id: randomUUID(), itemId: transfer.itemId, fromStage: "scheduled",
          toStage: "matched", notes: `Reserve pickup appointment ${current.id} canceled`,
        });
        await recordServiceActivity(tx, {
          activityType: "distribution", loopStage: "learned",
          relatedItemId: transfer.itemId, relatedClaimId: transfer.claimId,
          relatedAccountId: transfer.accountId, publicTrackingCode: current.publicTrackingCode,
          status: "cancelled", completedAt: new Date(),
          publicSafeSummary: "Distribution canceled", internalNotes: reason.trim(),
          idempotencyKey: `transfer:${transfer.id}:cancelled`,
        });
      } else if (transfer) {
        throw new Error(`Cannot ${status} an appointment with a ${transfer.status} transfer`);
      }
    }
    if (
      status === "completed" &&
      current.appointmentType === "reserve_item_pickup"
    ) {
      if (!relatedTransferId) throw new Error("Reserve pickup has no transfer");
      const [transfer] = await tx.select().from(transfersTable)
        .where(eq(transfersTable.id, relatedTransferId));
      if (transfer?.status !== "received") {
        throw new Error("Receive the transfer before completing the appointment");
      }
    }
    const by = res.locals.authMethod === "api-key"
      ? "api-key"
      : (res.locals.staffUserId ?? "staff");
    const [row] = await tx.update(appointmentsTable).set({
      status, staffAssigned: staffAssigned ?? current.staffAssigned,
      relatedTransferId,
      internalNotes: internalNotes ?? current.internalNotes,
      cancelReason: status === "canceled" ? reason.trim() : current.cancelReason,
      noShowReason: status === "no_show" ? reason.trim() : current.noShowReason,
      updatedAt: new Date(),
    }).where(eq(appointmentsTable.id, current.id)).returning();
    await tx.insert(appointmentHistoryTable).values({
      id: randomUUID(), appointmentId: current.id, fromStatus: current.status,
      toStatus: status, by, notes: reason?.trim() || null,
    });
    const loopStage = status === "confirmed" ? "scheduled"
      : status === "completed" ? "served"
      : status === "in_progress" ? "scheduled"
      : "learned";
    const activityType = activityTypeForAppointment(current.appointmentType);
    const activityKey = `appointment:${current.id}:${status}`;
    const activityId = await recordServiceActivity(tx, {
      activityType,
      loopStage,
      relatedItemId: current.relatedItemId,
      relatedClaimId: current.relatedClaimId,
      relatedAppointmentId: current.id,
      relatedAccountId: current.accountId,
      publicTrackingCode: current.publicTrackingCode,
      status,
      staffOwner: staffAssigned ?? current.staffAssigned ?? by,
      scheduledStart: current.scheduledStart,
      scheduledEnd: current.scheduledEnd,
      completedAt: status === "completed" ? new Date() : null,
      publicSafeSummary: status === "confirmed" ? "Appointment scheduled"
        : status === "completed" ? "Service completed"
        : status === "no_show" ? "Appointment marked no-show"
        : status === "canceled" ? "Appointment canceled"
        : "Service in progress",
      internalNotes: reason?.trim() || internalNotes || null,
      idempotencyKey: activityKey,
    });
    if (status === "completed") {
      await recordAcknowledgment(tx, {
        parentActivityId: activityId,
        relatedItemId: current.relatedItemId,
        relatedClaimId: current.relatedClaimId,
        relatedAppointmentId: current.id,
        relatedAccountId: current.accountId,
        publicTrackingCode: current.publicTrackingCode,
        staffOwner: staffAssigned ?? current.staffAssigned ?? by,
      });
    }
    return row;
  });
  if (!updated) { res.status(404).json({ error: "Appointment not found" }); return; }
  res.json(updated);
  } catch (error) {
    res.status(409).json({ error: error instanceof Error ? error.message : "Appointment could not be updated" });
  }
});

appointmentsRouter.patch("/appointments/:id/link-claim", async (req, res): Promise<void> => {
  const requestedCode = String(req.body?.trackingCode ?? "").trim().toUpperCase();
  const linked = await db.transaction(async (tx) => {
    const [appointment] = await tx.select().from(appointmentsTable)
      .where(eq(appointmentsTable.id, req.params.id)).for("update");
    if (!appointment || appointment.appointmentType !== "reserve_item_pickup" || appointment.status !== "requested") {
      return null;
    }
    if (appointment.reservationExpiresAt && appointment.reservationExpiresAt <= new Date()) {
      throw new Error("Expired reservation cannot be linked");
    }
    const trackingCode = requestedCode || appointment.requestedTrackingCode || "";
    const [claim] = await tx.select().from(claimsTable)
      .where(and(eq(claimsTable.trackingCode, trackingCode), eq(claimsTable.status, "approved"))).limit(1);
    if (!claim) throw new Error("An approved claim is required");
    const item = await itemRepository.forTransaction(tx).getById(claim.itemId);
    if (!item || item.stage !== "matched") throw new Error("Claim item must be matched");
    const [updated] = await tx.update(appointmentsTable).set({
      relatedClaimId: claim.id,
      relatedItemId: claim.itemId,
      accountId: claim.accountId,
      publicTrackingCode: claim.trackingCode,
      requestedTrackingCode: null,
      reservationExpiresAt: appointment.scheduledEnd,
      updatedAt: new Date(),
    }).where(eq(appointmentsTable.id, appointment.id)).returning();
    await recordServiceActivity(tx, {
      activityType: "item_reservation",
      loopStage: "matched",
      relatedItemId: claim.itemId,
      relatedClaimId: claim.id,
      relatedAppointmentId: appointment.id,
      relatedAccountId: claim.accountId,
      publicTrackingCode: claim.trackingCode,
      status: "reserved",
      scheduledStart: appointment.scheduledStart,
      scheduledEnd: appointment.scheduledEnd,
      publicSafeSummary: "Item reserved",
      internalNotes: "Claim linkage verified by staff.",
      idempotencyKey: `appointment:${appointment.id}:claim-linked`,
    });
    return updated;
  });
  if (!linked) { res.status(404).json({ error: "Eligible appointment not found" }); return; }
  res.json(linked);
});

appointmentsRouter.post("/appointments/expire-stale", async (_req, res) => {
  const expired = await expireStaleReservations();
  res.json({ expired });
});

appointmentsRouter.post("/capacity-slots", async (req, res): Promise<void> => {
  const { locationId, appointmentType, scheduledStart, scheduledEnd, maxBookings, bookingCutoff } = req.body ?? {};
  if (!locationId || !isType(appointmentType) || !scheduledStart || !scheduledEnd) {
    res.status(400).json({ error: "Location, type, start, and end are required" }); return;
  }
  const start = new Date(scheduledStart); const end = new Date(scheduledEnd);
  if (!(end > start)) { res.status(400).json({ error: "End must be after start" }); return; }
  const [slot] = await db.insert(capacitySlotsTable).values({
    id: randomUUID(), locationId, appointmentType, scheduledStart: start,
    scheduledEnd: end, maxBookings: Math.max(1, Number(maxBookings) || 1),
    bookingCutoff: bookingCutoff ? new Date(bookingCutoff) : null,
  }).returning();
  res.status(201).json(slot);
});

export default appointmentsRouter;