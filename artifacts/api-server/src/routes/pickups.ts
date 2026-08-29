import { randomUUID } from "crypto";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { requireSupervisor } from "../middlewares/apiKeyAuth";
import {
  AssignPickupRouteBody,
  AssignPickupRouteParams,
  CompletePickupBody,
  CompletePickupParams,
  CreatePickupBody,
  CreatePickupFlagBody,
  CreatePickupFlagParams,
  DispatchPickupParams,
  GetPickupParams,
  ListPickupsQueryParams,
  LogPickupContactAttemptBody,
  LogPickupContactAttemptParams,
  RecordPickupOutcomeBody,
  RecordPickupOutcomeParams,
  UpdateConfirmationTemplateBody,
  UpdatePickupBody,
  UpdatePickupFlagBody,
  UpdatePickupFlagParams,
  UpdatePickupParams,
} from "@workspace/api-zod";
import {
  confirmationTemplatesTable,
  db,
  deliveryRoutesTable,
  donationItemsTable,
  pickupContactAttemptsTable,
  pickupFlagsTable,
  pickupRequestsTable,
  routeStopsTable,
  stageHistoryTable,
} from "@workspace/db";

const router: IRouter = Router();

const DEFAULT_CONFIRMATION_TEMPLATE =
  "Your donation pickup is confirmed for [confirmed_datetime].\nOur team will be at [address].\nPlease reply CONFIRM to verify.";

function rawParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] : value ?? "";
}

function normalizeFlagValue(type: string, value: string): string {
  return type === "phone"
    ? value.replace(/\D/g, "")
    : value.trim().replace(/\s+/g, " ").toLowerCase();
}

function dispatchMissing(pickup: typeof pickupRequestsTable.$inferSelect): string[] {
  const missing: string[] = [];
  if (!pickup.name?.trim()) missing.push("Donor name");
  if (!pickup.addressVerified) missing.push("Verified address");
  if (!pickup.itemsDescribed?.trim()) missing.push("Items described");
  if (!pickup.confirmationReplied) missing.push("CONFIRM reply");
  return missing;
}

async function dispatchMissingWithFlags(
  pickup: typeof pickupRequestsTable.$inferSelect,
): Promise<string[]> {
  const missing = dispatchMissing(pickup);
  const flags = await matchingFlags(pickup);
  if (flags.some((flag) => flag.count >= 2 && !flag.supervisorApproved)) {
    missing.push("Supervisor approval for repeated phone/address flags");
  }
  return missing;
}

function outcomeToStatus(outcome: string): string | null {
  const statuses: Record<string, string> = {
    completed: "completed",
    no_show: "no_show",
    false_address: "false_address",
    cancelled: "cancelled",
  };
  return statuses[outcome] ?? null;
}

function generateItemId(): string {
  return `DS-${Math.floor(1000 + Math.random() * 9000)}`;
}

function generateLotNumber(): string {
  return `LOT-${Math.floor(1000 + Math.random() * 9000)}`;
}

function computeNumerology(date: Date): string {
  const dateStr = date.toISOString().split("T")[0].replace(/-/g, "");
  let sum = dateStr.split("").reduce((acc, digit) => acc + Number(digit), 0);
  while (sum > 9 && sum !== 11 && sum !== 22 && sum !== 33) {
    sum = String(sum)
      .split("")
      .reduce((acc, digit) => acc + Number(digit), 0);
  }
  return String(sum);
}

async function getPickup(id: string) {
  const [pickup] = await db
    .select()
    .from(pickupRequestsTable)
    .where(eq(pickupRequestsTable.id, id));
  return pickup;
}

async function generatePickupId(): Promise<string> {
  for (let attempt = 0; attempt < 25; attempt++) {
    const id = `PU-${Math.floor(1000 + Math.random() * 9000)}`;
    if (!(await getPickup(id))) return id;
  }
  return `PU-${randomUUID().slice(0, 8).toUpperCase()}`;
}

async function matchingFlags(pickup: typeof pickupRequestsTable.$inferSelect) {
  const allFlags = await db.select().from(pickupFlagsTable);
  return allFlags.filter((flag) => {
    const candidate =
      flag.type === "phone"
        ? normalizeFlagValue("phone", pickup.phone)
        : normalizeFlagValue("address", pickup.address);
    return flag.type === (flag.type === "phone" ? "phone" : "address")
      && normalizeFlagValue(flag.type, flag.value) === candidate;
  });
}

async function enrichFlag(flag: typeof pickupFlagsTable.$inferSelect) {
  const allPickups = await db.select().from(pickupRequestsTable);
  const associatedPickupIds = allPickups
    .filter((pickup) => {
      const value = flag.type === "phone" ? pickup.phone : pickup.address;
      return normalizeFlagValue(flag.type, value) === normalizeFlagValue(flag.type, flag.value);
    })
    .map((pickup) => pickup.id);

  return { ...flag, associatedPickupIds };
}

async function pickupDetail(pickup: typeof pickupRequestsTable.$inferSelect) {
  const contactHistory = await db
    .select()
    .from(pickupContactAttemptsTable)
    .where(eq(pickupContactAttemptsTable.pickupRequestId, pickup.id))
    .orderBy(desc(pickupContactAttemptsTable.createdAt));
  const flags = await matchingFlags(pickup);
  return {
    ...pickup,
    contactHistory,
    flags: await Promise.all(flags.map(enrichFlag)),
  };
}

async function syncExistingFlagState(
  pickup: typeof pickupRequestsTable.$inferSelect,
): Promise<typeof pickupRequestsTable.$inferSelect> {
  const flags = await matchingFlags(pickup);
  const phoneFlagged = flags.some((flag) => flag.type === "phone");
  const addressFlagged = flags.some((flag) => flag.type === "address");
  const requiresSupervisorApproval = flags.some(
    (flag) => flag.count >= 2 && !flag.supervisorApproved,
  );

  if (
    phoneFlagged !== pickup.phoneFlagged ||
    addressFlagged !== pickup.addressFlagged ||
    requiresSupervisorApproval !== pickup.requiresSupervisorApproval
  ) {
    const [updated] = await db
      .update(pickupRequestsTable)
      .set({
        phoneFlagged,
        addressFlagged,
        requiresSupervisorApproval,
        updatedAt: new Date(),
      })
      .where(eq(pickupRequestsTable.id, pickup.id))
      .returning();
    return updated;
  }
  return pickup;
}

async function addOrIncrementFlag(
  pickup: typeof pickupRequestsTable.$inferSelect,
  type: "phone" | "address",
  rawValue: string,
  reason: string,
  initialCount = 1,
) {
  const value = normalizeFlagValue(type, rawValue);
  const [existing] = await db
    .select()
    .from(pickupFlagsTable)
    .where(and(eq(pickupFlagsTable.type, type), eq(pickupFlagsTable.value, value)));

  if (existing) {
    await db
      .update(pickupFlagsTable)
      .set({
        count: existing.count + 1,
        reason,
        pickupRequestId: pickup.id,
        updatedAt: new Date(),
      })
      .where(eq(pickupFlagsTable.id, existing.id));
  } else {
    await db.insert(pickupFlagsTable).values({
      id: randomUUID(),
      type,
      value,
      reason,
      pickupRequestId: pickup.id,
      count: initialCount,
    });
  }

  return syncExistingFlagState(pickup);
}

async function countOutcomeForValue(
  type: "phone" | "address",
  value: string,
  outcome: string,
): Promise<number> {
  const all = await db.select().from(pickupRequestsTable);
  const normalized = normalizeFlagValue(type, value);
  return all.filter((pickup) => {
    const candidate = type === "phone" ? pickup.phone : pickup.address;
    return (
      pickup.outcome === outcome &&
      normalizeFlagValue(type, candidate) === normalized
    );
  }).length;
}

function derivedStatus(pickup: typeof pickupRequestsTable.$inferSelect): string {
  if (!["unverified", "contact_made", "confirmed"].includes(pickup.status)) {
    return pickup.status;
  }
  return dispatchMissing(pickup).length === 0 ? "confirmed" : pickup.status;
}

// GET /pickups
router.get("/pickups", async (req, res): Promise<void> => {
  const parsed = ListPickupsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const conditions = [];
  if (parsed.data.status) conditions.push(eq(pickupRequestsTable.status, parsed.data.status));
  if (parsed.data.from) conditions.push(gte(pickupRequestsTable.createdAt, parsed.data.from));
  if (parsed.data.to) conditions.push(lte(pickupRequestsTable.createdAt, parsed.data.to));

  let pickups = await db
    .select()
    .from(pickupRequestsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(pickupRequestsTable.createdAt));

  if (parsed.data.flagged) {
    pickups = pickups.filter(
      (pickup) => pickup.phoneFlagged || pickup.addressFlagged || pickup.requiresSupervisorApproval,
    );
  }

  res.json(pickups);
});

// POST /pickups
router.post("/pickups", async (req, res): Promise<void> => {
  const parsed = CreatePickupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const id = await generatePickupId();
  const [created] = await db
    .insert(pickupRequestsTable)
    .values({
      id,
      status: "unverified",
      phone: parsed.data.phone.trim(),
      name: parsed.data.name ?? null,
      address: parsed.data.address.trim(),
      addressConfirmed: parsed.data.addressConfirmed ?? false,
      addressVerified: parsed.data.addressVerified ?? false,
      addressType: parsed.data.addressType ?? "other",
      requestedWindow: parsed.data.requestedWindow.trim(),
      confirmedDatetime: parsed.data.confirmedDatetime ?? null,
      itemsDescribed: parsed.data.itemsDescribed ?? null,
      confirmationSent: parsed.data.confirmationSent ?? false,
      confirmationReplied: parsed.data.confirmationReplied ?? false,
      assignedDriver: parsed.data.assignedDriver ?? null,
    })
    .returning();

  const flagged = await syncExistingFlagState(created);
  const status = derivedStatus(flagged);
  const [updated] =
    status !== flagged.status
      ? await db
          .update(pickupRequestsTable)
          .set({ status, updatedAt: new Date() })
          .where(eq(pickupRequestsTable.id, flagged.id))
          .returning()
      : [flagged];

  res.status(201).json(await pickupDetail(updated));
});

// GET /pickups/:id
router.get("/pickups/:id", async (req, res): Promise<void> => {
  const parsed = GetPickupParams.safeParse({ id: rawParam(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const pickup = await getPickup(parsed.data.id);
  if (!pickup) {
    res.status(404).json({ error: "Pickup request not found" });
    return;
  }
  res.json(await pickupDetail(pickup));
});

// PATCH /pickups/:id
router.patch("/pickups/:id", async (req, res): Promise<void> => {
  const params = UpdatePickupParams.safeParse({ id: rawParam(req.params.id) });
  const body = UpdatePickupBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const pickup = await getPickup(params.data.id);
  if (!pickup) {
    res.status(404).json({ error: "Pickup request not found" });
    return;
  }
  if (!["unverified", "contact_made", "confirmed"].includes(pickup.status)) {
    res.status(409).json({ error: "Only an active pickup can be edited" });
    return;
  }
  if (pickup.status === "closed_no_response" && body.data.confirmedDatetime) {
    res.status(409).json({ error: "Closed pickup requests cannot be scheduled" });
    return;
  }

  const [updated] = await db
    .update(pickupRequestsTable)
    .set({ ...body.data, updatedAt: new Date() })
    .where(eq(pickupRequestsTable.id, pickup.id))
    .returning();

  const withFlags = await syncExistingFlagState(updated);
  const status = derivedStatus(withFlags);
  const [withStatus] =
    status !== withFlags.status
      ? await db
          .update(pickupRequestsTable)
          .set({ status, updatedAt: new Date() })
          .where(eq(pickupRequestsTable.id, withFlags.id))
          .returning()
      : [withFlags];

  res.json(await pickupDetail(withStatus));
});

// POST /pickups/:id/contact-attempt
router.post("/pickups/:id/contact-attempt", async (req, res): Promise<void> => {
  const params = LogPickupContactAttemptParams.safeParse({ id: rawParam(req.params.id) });
  const body = LogPickupContactAttemptBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const pickup = await getPickup(params.data.id);
  if (!pickup) {
    res.status(404).json({ error: "Pickup request not found" });
    return;
  }
  if (!["unverified", "contact_made"].includes(pickup.status)) {
    res.status(409).json({ error: "Contact attempts are only allowed before pickup confirmation" });
    return;
  }

  const attemptNumber = pickup.contactAttempts + 1;
  const closed = body.data.result === "no_response" && attemptNumber >= 2;
  const status =
    body.data.result === "contacted"
      ? "contact_made"
      : closed
        ? "closed_no_response"
        : pickup.status;

  await db.insert(pickupContactAttemptsTable).values({
    id: randomUUID(),
    pickupRequestId: pickup.id,
    attemptNumber,
    result: body.data.result,
    notes: body.data.notes ?? null,
  });

  const [updated] = await db
    .update(pickupRequestsTable)
    .set({ contactAttempts: attemptNumber, status, updatedAt: new Date() })
    .where(eq(pickupRequestsTable.id, pickup.id))
    .returning();

  res.json(await pickupDetail(updated));
});

// POST /pickups/:id/dispatch
router.post("/pickups/:id/dispatch", async (req, res): Promise<void> => {
  const params = DispatchPickupParams.safeParse({ id: rawParam(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const pickup = await getPickup(params.data.id);
  if (!pickup) {
    res.status(404).json({ error: "Pickup request not found" });
    return;
  }

  if (pickup.status !== "confirmed") {
    res.status(409).json({
      error: "Pickup must be confirmed before dispatch",
      missing: ["All verification requirements must be complete"],
    });
    return;
  }

  const synchronized = await syncExistingFlagState(pickup);
  const missing = await dispatchMissingWithFlags(synchronized);
  if (missing.length > 0) {
    res.status(409).json({ error: "Pickup is not ready to dispatch", missing });
    return;
  }

  const [updated] = await db
    .update(pickupRequestsTable)
    .set({ status: "dispatched", updatedAt: new Date() })
    .where(eq(pickupRequestsTable.id, pickup.id))
    .returning();
  res.json(await pickupDetail(updated));
});

// POST /pickups/:id/outcome
router.post("/pickups/:id/outcome", async (req, res): Promise<void> => {
  const params = RecordPickupOutcomeParams.safeParse({ id: rawParam(req.params.id) });
  const body = RecordPickupOutcomeBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const pickup = await getPickup(params.data.id);
  if (!pickup) {
    res.status(404).json({ error: "Pickup request not found" });
    return;
  }
  if (!["confirmed", "dispatched"].includes(pickup.status)) {
    res.status(409).json({ error: "Only confirmed or dispatched pickups can have an outcome" });
    return;
  }
  if (body.data.outcome === "completed") {
    res.status(409).json({ error: "Use the completion action to create the intake item" });
    return;
  }

  const status = outcomeToStatus(body.data.outcome) ?? pickup.status;
  const [updated] = await db
    .update(pickupRequestsTable)
    .set({
      status,
      outcome: body.data.outcome,
      outcomeNotes: body.data.notes ?? null,
      updatedAt: new Date(),
    })
    .where(eq(pickupRequestsTable.id, pickup.id))
    .returning();

  let flagged = updated;
  if (body.data.outcome === "false_address") {
    flagged = await addOrIncrementFlag(updated, "address", updated.address, "Confirmed false address");
  }
  if (body.data.outcome === "no_show") {
    const phoneNoShows = await countOutcomeForValue("phone", updated.phone, "no_show");
    const addressNoShows = await countOutcomeForValue("address", updated.address, "no_show");
    if (phoneNoShows >= 2) {
      flagged = await addOrIncrementFlag(
        flagged,
        "phone",
        flagged.phone,
        "Two or more pickup no-shows",
        phoneNoShows,
      );
    }
    if (addressNoShows >= 2) {
      flagged = await addOrIncrementFlag(
        flagged,
        "address",
        flagged.address,
        "Two or more pickup no-shows",
        addressNoShows,
      );
    }
  }
  if (body.data.outcome === "flagged") {
    flagged = await syncExistingFlagState(updated);
  }

  res.json(await pickupDetail(flagged));
});

// POST /pickups/:id/complete
router.post("/pickups/:id/complete", async (req, res): Promise<void> => {
  const params = CompletePickupParams.safeParse({ id: rawParam(req.params.id) });
  const body = CompletePickupBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const pickup = await getPickup(params.data.id);
  if (!pickup) {
    res.status(404).json({ error: "Pickup request not found" });
    return;
  }
  if (pickup.status !== "dispatched") {
    res.status(409).json({ error: "Only dispatched pickups can be completed" });
    return;
  }

  const now = new Date();
  const completion = await db.transaction(async (tx) => {
    const [existingItem] = await tx
      .select()
      .from(donationItemsTable)
      .where(eq(donationItemsTable.sourcePickupId, pickup.id));
    if (existingItem) {
      return { pickup, item: existingItem };
    }

    const [completed] = await tx
      .update(pickupRequestsTable)
      .set({
        status: "completed",
        outcome: "completed",
        itemsReceived: body.data.itemsReceived,
        outcomeNotes: body.data.notes ?? pickup.outcomeNotes,
        updatedAt: now,
      })
      .where(
        and(
          eq(pickupRequestsTable.id, pickup.id),
          eq(pickupRequestsTable.status, "dispatched"),
        ),
      )
      .returning();
    if (!completed) return null;

    const [item] = await tx
      .insert(donationItemsTable)
      .values({
        id: randomUUID(),
        itemId: generateItemId(),
        name: body.data.itemsReceived,
        category: body.data.category ?? "Pickup Donation",
        tier: "R",
        condition: body.data.condition ?? "good",
        donor: completed.name?.trim() || completed.phone,
        origin: completed.address,
        lotNumber: generateLotNumber(),
        powerConnectionReading: computeNumerology(now),
        sourcePickupId: completed.id,
        stage: "intake",
      })
      .returning();

    await tx.insert(stageHistoryTable).values({
      id: randomUUID(),
      itemId: item.id,
      fromStage: null,
      toStage: "intake",
      notes: `Received from completed pickup ${completed.id}${body.data.notes ? ` | ${body.data.notes}` : ""}`,
    });

    return { pickup: completed, item };
  });

  if (!completion) {
    const current = await getPickup(pickup.id);
    if (current?.status === "completed") {
      const [existingItem] = await db
        .select()
        .from(donationItemsTable)
        .where(eq(donationItemsTable.sourcePickupId, pickup.id));
      if (existingItem) {
        res.json({ pickup: await pickupDetail(current), item: existingItem });
        return;
      }
    }
    res.status(409).json({ error: "Pickup was already completed or is no longer dispatched" });
    return;
  }

  res.json({ pickup: await pickupDetail(completion.pickup), item: completion.item });
});

// POST /pickups/:id/route
router.post("/pickups/:id/route", async (req, res): Promise<void> => {
  const params = AssignPickupRouteParams.safeParse({ id: rawParam(req.params.id) });
  const body = AssignPickupRouteBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const pickup = await getPickup(params.data.id);
  if (!pickup) {
    res.status(404).json({ error: "Pickup request not found" });
    return;
  }
  if (!["confirmed", "dispatched"].includes(pickup.status)) {
    res.status(409).json({ error: "Only confirmed pickups can be assigned to a route" });
    return;
  }
  const [route] = await db
    .select()
    .from(deliveryRoutesTable)
    .where(eq(deliveryRoutesTable.id, body.data.linkedRouteId));
  if (!route) {
    res.status(404).json({ error: "Delivery route not found" });
    return;
  }

  if (pickup.linkedRouteId && pickup.linkedRouteId !== route.id) {
    await db
      .delete(routeStopsTable)
      .where(eq(routeStopsTable.pickupRequestId, pickup.id));
  }

  const existingStops = await db
    .select()
    .from(routeStopsTable)
    .where(eq(routeStopsTable.routeId, route.id))
    .orderBy(desc(routeStopsTable.stopOrder));
  const existingPickupStop = existingStops.find((stop) => stop.pickupRequestId === pickup.id);
  if (!existingPickupStop) {
    await db.insert(routeStopsTable).values({
      id: randomUUID(),
      routeId: route.id,
      pickupRequestId: pickup.id,
      stopOrder: existingStops.length > 0 ? existingStops[0].stopOrder + 1 : 1,
      notes: `Pickup ${pickup.id}: ${pickup.address}`,
    });
  }

  const [updated] = await db
    .update(pickupRequestsTable)
    .set({
      linkedRouteId: route.id,
      assignedDriver: body.data.assignedDriver ?? pickup.assignedDriver,
      confirmedDatetime: body.data.confirmedDatetime ?? pickup.confirmedDatetime,
      updatedAt: new Date(),
    })
    .where(eq(pickupRequestsTable.id, pickup.id))
    .returning();
  res.json(await pickupDetail(updated));
});

// POST /pickups/:id/flags
router.post("/pickups/:id/flags", async (req, res): Promise<void> => {
  const params = CreatePickupFlagParams.safeParse({ id: rawParam(req.params.id) });
  const body = CreatePickupFlagBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const pickup = await getPickup(params.data.id);
  if (!pickup) {
    res.status(404).json({ error: "Pickup request not found" });
    return;
  }
  const updated = await addOrIncrementFlag(
    pickup,
    body.data.type,
    body.data.value,
    body.data.reason,
  );
  res.status(201).json(await pickupDetail(updated));
});

// GET /flags
router.get("/flags", async (_req, res): Promise<void> => {
  const flags = await db.select().from(pickupFlagsTable).orderBy(desc(pickupFlagsTable.updatedAt));
  res.json(await Promise.all(flags.map(enrichFlag)));
});

// PATCH /flags/:id
router.patch("/flags/:id", requireSupervisor, async (req, res): Promise<void> => {
  const params = UpdatePickupFlagParams.safeParse({ id: rawParam(req.params.id) });
  const body = UpdatePickupFlagBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [flag] = await db
    .update(pickupFlagsTable)
    .set({ ...body.data, updatedAt: new Date() })
    .where(eq(pickupFlagsTable.id, params.data.id))
    .returning();
  if (!flag) {
    res.status(404).json({ error: "Pickup flag not found" });
    return;
  }
  const allPickups = await db.select().from(pickupRequestsTable);
  await Promise.all(
    allPickups
      .filter((pickup) => {
        const value = flag.type === "phone" ? pickup.phone : pickup.address;
        return normalizeFlagValue(flag.type, value) === normalizeFlagValue(flag.type, flag.value);
      })
      .map((pickup) => syncExistingFlagState(pickup)),
  );
  res.json(await enrichFlag(flag));
});

// GET /confirmation-template
router.get("/confirmation-template", async (_req, res): Promise<void> => {
  const [template] = await db
    .select()
    .from(confirmationTemplatesTable)
    .where(eq(confirmationTemplatesTable.id, "pickup-confirmation"));
  res.json(
    template ?? {
      id: "pickup-confirmation",
      body: DEFAULT_CONFIRMATION_TEMPLATE,
      updatedAt: new Date(),
    },
  );
});

// PUT /confirmation-template
router.put("/confirmation-template", async (req, res): Promise<void> => {
  const body = UpdateConfirmationTemplateBody.safeParse(req.body);
  if (!body.success || !body.data.body.trim()) {
    res.status(400).json({ error: body.success ? "Template body is required" : body.error.message });
    return;
  }
  const [template] = await db
    .insert(confirmationTemplatesTable)
    .values({ id: "pickup-confirmation", body: body.data.body.trim() })
    .onConflictDoUpdate({
      target: confirmationTemplatesTable.id,
      set: { body: body.data.body.trim(), updatedAt: new Date() },
    })
    .returning();
  res.json(template);
});

export default router;