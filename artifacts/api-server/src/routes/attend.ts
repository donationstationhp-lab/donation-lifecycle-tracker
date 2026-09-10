import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, like } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  allocateClaimTrackingCode, ensureClaimTrackingCodes, attendDeliveryAlertsTable, db, claimEvidenceTable, claimHistoryTable, claimsTable, donationItemsTable,
  notificationOutboxTable, recipientAccountsTable, stageHistoryTable, transferHistoryTable, transfersTable,
} from "@workspace/db";
import {
  AddClaimEvidenceBody, AddClaimEvidenceParams, CreateAccountBody, CreateAccountResponse,
  CreateClaimBody, CreateClaimResponse, CreateTransferBody, CreateTransferResponse,
  ListAccountsQueryParams, ListAccountsResponse, ListClaimsQueryParams, ListClaimsResponse,
  ListTransfersQueryParams, ListTransfersResponse, TransitionClaimBody, TransitionClaimParams,
  TransitionClaimResponse, TransitionTransferBody, TransitionTransferParams, TransitionTransferResponse,
  GetClaimParams, GetClaimResponse, GetTransferParams, GetTransferResponse,
  ListAttendDeliveryAlertsResponse, ListAttendOutboxResponse,
  AcknowledgeAttendDeliveryAlertParams, AcknowledgeAttendDeliveryAlertResponse,
} from "@workspace/api-zod";
import { requireSupervisor } from "../middlewares/apiKeyAuth";
import { canCollectEvidence, validateClaimTransition, validateTransferTransition, type ClaimStatus, type TransferStatus } from "../lib/attendTransitions";
import { deliverAttendOutboxByDedupeKey } from "../lib/attendSheets";
import { isUniqueViolation } from "../lib/dbErrors";
import { recordAcknowledgment, recordServiceActivity } from "../lib/serviceActivities";

const router: IRouter = Router();
const actor = (res: import("express").Response) => res.locals.authMethod === "api-key" ? "api-key" : (res.locals.staffUserId ?? "staff");
const event = (aggregateType: string, aggregateId: string, to: string) => ({
  id: randomUUID(), aggregateType, aggregateId, eventType: `${aggregateType}.${to}`,
  dedupeKey: `${aggregateType}:${aggregateId}:${to}`, payload: JSON.stringify({ aggregateId, status: to }),
});

router.get("/attend/outbox", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: notificationOutboxTable.id,
      eventType: notificationOutboxTable.eventType,
      aggregateType: notificationOutboxTable.aggregateType,
      aggregateId: notificationOutboxTable.aggregateId,
      dedupeKey: notificationOutboxTable.dedupeKey,
      status: notificationOutboxTable.status,
      attempts: notificationOutboxTable.attempts,
      lastError: notificationOutboxTable.lastError,
      nextRetryAt: notificationOutboxTable.nextRetryAt,
      processingLeaseUntil: notificationOutboxTable.processingLeaseUntil,
      sentAt: notificationOutboxTable.sentAt,
      createdAt: notificationOutboxTable.createdAt,
    })
    .from(notificationOutboxTable)
    .orderBy(desc(notificationOutboxTable.createdAt))
    .limit(100);
  res.json(ListAttendOutboxResponse.parse(rows));
});

router.get("/attend/alerts", requireSupervisor, async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: attendDeliveryAlertsTable.id,
      outboxId: attendDeliveryAlertsTable.outboxId,
      eventType: attendDeliveryAlertsTable.eventType,
      aggregateType: attendDeliveryAlertsTable.aggregateType,
      aggregateId: attendDeliveryAlertsTable.aggregateId,
      lastError: attendDeliveryAlertsTable.lastError,
      acknowledgedAt: attendDeliveryAlertsTable.acknowledgedAt,
      acknowledgedBy: attendDeliveryAlertsTable.acknowledgedBy,
      createdAt: attendDeliveryAlertsTable.createdAt,
    })
    .from(attendDeliveryAlertsTable)
    .orderBy(desc(attendDeliveryAlertsTable.createdAt))
    .limit(100);
  res.json(ListAttendDeliveryAlertsResponse.parse(rows));
});

router.patch("/attend/alerts/:id", requireSupervisor, async (req, res): Promise<void> => {
  const parsed = AcknowledgeAttendDeliveryAlertParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select({
      id: attendDeliveryAlertsTable.id,
      outboxId: attendDeliveryAlertsTable.outboxId,
      eventType: attendDeliveryAlertsTable.eventType,
      aggregateType: attendDeliveryAlertsTable.aggregateType,
      aggregateId: attendDeliveryAlertsTable.aggregateId,
      lastError: attendDeliveryAlertsTable.lastError,
      acknowledgedAt: attendDeliveryAlertsTable.acknowledgedAt,
      acknowledgedBy: attendDeliveryAlertsTable.acknowledgedBy,
      createdAt: attendDeliveryAlertsTable.createdAt,
    })
    .from(attendDeliveryAlertsTable)
    .where(eq(attendDeliveryAlertsTable.id, parsed.data.id));

  if (!existing) {
    res.status(404).json({ error: "ATTEND delivery alert not found" });
    return;
  }

  if (!existing.acknowledgedAt) {
    const [acknowledged] = await db
      .update(attendDeliveryAlertsTable)
      .set({
        acknowledgedAt: new Date(),
        acknowledgedBy: actor(res),
      })
      .where(eq(attendDeliveryAlertsTable.id, parsed.data.id))
      .returning({
        id: attendDeliveryAlertsTable.id,
        outboxId: attendDeliveryAlertsTable.outboxId,
        eventType: attendDeliveryAlertsTable.eventType,
        aggregateType: attendDeliveryAlertsTable.aggregateType,
        aggregateId: attendDeliveryAlertsTable.aggregateId,
        lastError: attendDeliveryAlertsTable.lastError,
        acknowledgedAt: attendDeliveryAlertsTable.acknowledgedAt,
        acknowledgedBy: attendDeliveryAlertsTable.acknowledgedBy,
        createdAt: attendDeliveryAlertsTable.createdAt,
      });
    res.json(AcknowledgeAttendDeliveryAlertResponse.parse(acknowledged));
    return;
  }

  res.json(AcknowledgeAttendDeliveryAlertResponse.parse(existing));
});

router.get("/accounts", async (req, res): Promise<void> => {
  const parsed = ListAccountsQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const conditions = [];
  if (parsed.data.search) conditions.push(like(recipientAccountsTable.name, `%${parsed.data.search}%`));
  if (parsed.data.type) conditions.push(eq(recipientAccountsTable.type, parsed.data.type));
  res.json(ListAccountsResponse.parse(await db.select().from(recipientAccountsTable).where(conditions.length ? and(...conditions) : undefined)));
});
router.post("/accounts", async (req, res): Promise<void> => {
  const parsed = CreateAccountBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [account] = await db.insert(recipientAccountsTable).values({ id: randomUUID(), ...parsed.data }).returning();
  res.status(201).json(CreateAccountResponse.parse(account));
});
router.get("/claims", async (req, res): Promise<void> => {
  const parsed = ListClaimsQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  await ensureClaimTrackingCodes();
  const c = parsed.data;
  const conditions = [c.status ? eq(claimsTable.status, c.status) : undefined, c.accountId ? eq(claimsTable.accountId, c.accountId) : undefined, c.itemId ? eq(claimsTable.itemId, c.itemId) : undefined].filter(Boolean);
  const rows = await db.select().from(claimsTable).innerJoin(donationItemsTable, eq(claimsTable.itemId, donationItemsTable.id)).where(conditions.length ? and(...conditions) : undefined);
  res.json(ListClaimsResponse.parse(rows.filter(({ donation_items }) => !c.itemStage || donation_items.stage === c.itemStage).map(({ claims }) => claims)));
});
router.post("/claims", async (req, res): Promise<void> => {
  const parsed = CreateClaimBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [[account], [item]] = await Promise.all([
    db.select({ id: recipientAccountsTable.id }).from(recipientAccountsTable).where(eq(recipientAccountsTable.id, parsed.data.accountId)),
    db.select({ id: donationItemsTable.id }).from(donationItemsTable).where(eq(donationItemsTable.id, parsed.data.itemId)),
  ]);
  if (!account || !item) { res.status(404).json({ error: "Recipient account or item not found" }); return; }
  const by = actor(res); const id = randomUUID();
  const claim = await db.transaction(async (tx) => {
    const trackingCode = await allocateClaimTrackingCode(tx);
    const [created] = await tx.insert(claimsTable).values({
      id,
      trackingCode,
      ...parsed.data,
      submittedBy: by,
    }).returning();
    await tx.insert(claimHistoryTable).values({ id: randomUUID(), claimId: id, fromStatus: null, toStatus: "submitted", by });
    await tx.insert(notificationOutboxTable).values(event("claim", id, "submitted")).onConflictDoNothing();
    await recordServiceActivity(tx, {
      activityType: "claim_request", loopStage: "received",
      relatedItemId: created.itemId, relatedClaimId: id, relatedAccountId: created.accountId,
      publicTrackingCode: trackingCode, status: "submitted", staffOwner: by,
      publicSafeSummary: "Request received", internalNotes: parsed.data.notes ?? null,
      idempotencyKey: `claim:${id}:submitted`,
    });
    return created;
  });
  res.status(201).json(CreateClaimResponse.parse(claim));
  void deliverAttendOutboxByDedupeKey(`claim:${id}:submitted`);
});
router.post("/claims/:id/evidence", async (req, res): Promise<void> => {
  const params = AddClaimEvidenceParams.safeParse(req.params); const body = AddClaimEvidenceBody.safeParse(req.body);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [claim] = await db.select({ status: claimsTable.status }).from(claimsTable).where(eq(claimsTable.id, params.data.id));
  if (!claim) { res.status(404).json({ error: "Claim not found" }); return; }
  const allowed = canCollectEvidence(claim.status as ClaimStatus);
  if (!allowed.ok) { res.status(409).json({ error: allowed.reason }); return; }
  const [row] = await db.insert(claimEvidenceTable).values({ id: randomUUID(), claimId: params.data.id, ...body.data, createdBy: actor(res) }).returning();
  res.status(201).json(row);
});
router.get("/claims/:id", async (req, res): Promise<void> => {
  const params = GetClaimParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await ensureClaimTrackingCodes();
  const [claim] = await db.select().from(claimsTable).where(eq(claimsTable.id, params.data.id));
  if (!claim) { res.status(404).json({ error: "Claim not found" }); return; }
  const [[account], [item], evidence, history] = await Promise.all([
    db.select({ id: recipientAccountsTable.id, name: recipientAccountsTable.name, type: recipientAccountsTable.type }).from(recipientAccountsTable).where(eq(recipientAccountsTable.id, claim.accountId)),
    db.select({ id: donationItemsTable.id, itemId: donationItemsTable.itemId, name: donationItemsTable.name, stage: donationItemsTable.stage }).from(donationItemsTable).where(eq(donationItemsTable.id, claim.itemId)),
    db.select().from(claimEvidenceTable).where(eq(claimEvidenceTable.claimId, claim.id)),
    db.select().from(claimHistoryTable).where(eq(claimHistoryTable.claimId, claim.id)).orderBy(claimHistoryTable.timestamp),
  ]);
  if (!account || !item) { res.status(409).json({ error: "Claim references missing account or item" }); return; }
  res.json(GetClaimResponse.parse({ ...claim, account, item, evidence, history }));
});
router.patch("/claims/:id/status", async (req, res): Promise<void> => {
  const params = TransitionClaimParams.safeParse(req.params); const body = TransitionClaimBody.safeParse(req.body);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  if (body.data.status === "approved" && res.locals.staffRole !== "supervisor") { requireSupervisor(req, res, () => undefined); return; }
  const result = await db.transaction(async (tx) => {
    const [snapshot] = await tx.select().from(claimsTable).where(eq(claimsTable.id, params.data.id));
    if (!snapshot) return { error: "Claim not found" };
    const [item] = await tx.select().from(donationItemsTable).where(eq(donationItemsTable.id, snapshot.itemId)).for("update");
    const [claim] = await tx.select().from(claimsTable).where(eq(claimsTable.id, params.data.id)).for("update");
    if (!claim || !item) return { error: "Claim references a missing item" };
    const evidence = await tx.select().from(claimEvidenceTable).where(eq(claimEvidenceTable.claimId, claim.id));
    const allowed = validateClaimTransition(claim.status as ClaimStatus, body.data.status as ClaimStatus, evidence);
    if (!allowed.ok) return { error: allowed.reason };
    if (allowed.idempotent) return { claim };
    if (body.data.status === "approved" && item.stage !== "storage") {
      return { error: "Item must be in storage before a claim can be approved" };
    }
    if (claim.status === "approved" && body.data.status === "cancelled") {
      const [activeTransfer] = await tx
        .select({ id: transfersTable.id })
        .from(transfersTable)
        .where(and(
          eq(transfersTable.claimId, claim.id),
          inArray(transfersTable.status, ["planned", "released"]),
        ))
        .limit(1);
      if (activeTransfer) {
        return { error: "Cancel the active transfer before cancelling this claim" };
      }
      if (item.stage !== "matched") {
        return { error: "Matched item stage is required to cancel an approved claim" };
      }
    }
    const by = actor(res); const [updated] = await tx.update(claimsTable).set({ status: body.data.status, ...(body.data.status === "approved" ? { approvedBy: by } : {}) }).where(eq(claimsTable.id, claim.id)).returning();
    await tx.insert(claimHistoryTable).values({ id: randomUUID(), claimId: claim.id, fromStatus: claim.status, toStatus: body.data.status, by, notes: body.data.notes ?? null });
    if (body.data.status === "approved" && item.stage === "storage") {
      const [matched] = await tx.update(donationItemsTable).set({ stage: "matched", updatedAt: new Date() }).where(and(eq(donationItemsTable.id, item.id), eq(donationItemsTable.stage, "storage"))).returning();
      if (!matched) return { error: "Item stage changed while approving claim" };
      await tx.insert(stageHistoryTable).values({ id: randomUUID(), itemId: item.id, fromStage: "storage", toStage: "matched", notes: `Claim ${claim.id} approved` });
    }
    if (claim.status === "approved" && body.data.status === "cancelled") {
      const [restored] = await tx.update(donationItemsTable).set({ stage: "storage", updatedAt: new Date() }).where(and(eq(donationItemsTable.id, item.id), eq(donationItemsTable.stage, "matched"))).returning();
      if (!restored) return { error: "Item stage changed while cancelling claim" };
      await tx.insert(stageHistoryTable).values({ id: randomUUID(), itemId: item.id, fromStage: "matched", toStage: "storage", notes: `Claim ${claim.id} cancelled` });
    }
    await tx.insert(notificationOutboxTable).values(event("claim", claim.id, body.data.status)).onConflictDoNothing();
    await recordServiceActivity(tx, {
      activityType: "claim_request",
      loopStage: body.data.status === "approved" ? "matched"
        : body.data.status === "cancelled" || body.data.status === "denied" ? "learned"
        : "recognized",
      relatedItemId: claim.itemId, relatedClaimId: claim.id, relatedAccountId: claim.accountId,
      publicTrackingCode: claim.trackingCode, status: body.data.status, staffOwner: by,
      publicSafeSummary: body.data.status === "approved" ? "Eligibility verified and item matched"
        : body.data.status === "cancelled" ? "Request canceled"
        : body.data.status === "denied" ? "Request closed" : "Request under review",
      internalNotes: body.data.notes ?? null,
      idempotencyKey: `claim:${claim.id}:${body.data.status}`,
    });
    return { claim: updated };
  });
  if ("error" in result) { res.status(result.error === "Claim not found" ? 404 : 409).json({ error: result.error }); return; }
  res.json(TransitionClaimResponse.parse(result.claim));
  void deliverAttendOutboxByDedupeKey(`claim:${params.data.id}:${body.data.status}`);
});
router.get("/transfers", async (req, res): Promise<void> => {
  const parsed = ListTransfersQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const q = parsed.data;
  const conditions = [q.status ? eq(transfersTable.status, q.status) : undefined, q.accountId ? eq(transfersTable.accountId, q.accountId) : undefined, q.itemId ? eq(transfersTable.itemId, q.itemId) : undefined, q.claimId ? eq(transfersTable.claimId, q.claimId) : undefined].filter(Boolean);
  res.json(ListTransfersResponse.parse(await db.select().from(transfersTable).where(conditions.length ? and(...conditions) : undefined)));
});
router.post("/transfers", async (req, res): Promise<void> => {
  const parsed = CreateTransferBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const id = randomUUID(); const by = actor(res);
  let transfer;
  try {
    transfer = await db.transaction(async (tx) => {
      // Lock item then claim everywhere that both allocation records are changed.
      const [item] = await tx.select().from(donationItemsTable).where(eq(donationItemsTable.id, parsed.data.itemId)).for("update");
      const [claim] = await tx.select().from(claimsTable).where(eq(claimsTable.id, parsed.data.claimId)).for("update");
      if (!item || !claim || claim.status !== "approved" || claim.accountId !== parsed.data.accountId || claim.itemId !== parsed.data.itemId) {
        throw new Error("TRANSFER_PRECONDITION");
      }
      if (item.stage !== "matched") throw new Error("ITEM_NOT_MATCHED");
      const [created] = await tx.insert(transfersTable).values({ id, ...parsed.data }).returning();
      const [scheduled] = await tx.update(donationItemsTable).set({ stage: "scheduled", updatedAt: new Date() }).where(and(eq(donationItemsTable.id, item.id), eq(donationItemsTable.stage, "matched"))).returning();
      if (!scheduled) throw new Error("ITEM_NOT_MATCHED");
      await tx.insert(transferHistoryTable).values({ id: randomUUID(), transferId: id, fromStatus: null, toStatus: "planned", by });
      await tx.insert(stageHistoryTable).values({ id: randomUUID(), itemId: item.id, fromStage: "matched", toStage: "scheduled", notes: `Transfer ${id} planned` });
      await tx.insert(notificationOutboxTable).values(event("transfer", id, "planned")).onConflictDoNothing();
      const activityId = await recordServiceActivity(tx, {
        activityType: "distribution", loopStage: "scheduled",
        relatedItemId: item.id, relatedClaimId: claim.id, relatedAccountId: claim.accountId,
        publicTrackingCode: claim.trackingCode, status: "planned", staffOwner: by,
        publicSafeSummary: "Distribution scheduled", internalNotes: parsed.data.notes ?? null,
        idempotencyKey: `transfer:${id}:planned`,
      });
      return created;
    });
  } catch (error) {
    if (
      isUniqueViolation(error, "transfers_active_claim_idx")
      || isUniqueViolation(error, "transfers_active_item_idx")
      || (error instanceof Error && error.message === "TRANSFER_PRECONDITION")
      || (error instanceof Error && error.message === "ITEM_NOT_MATCHED")
    ) {
      res.status(409).json({ error: "Transfer requires an approved claim with a matched item and no active transfer" }); return;
    }
    throw error;
  }
  res.status(201).json(CreateTransferResponse.parse(transfer));
  void deliverAttendOutboxByDedupeKey(`transfer:${id}:planned`);
});
router.get("/transfers/:id", async (req, res): Promise<void> => {
  const params = GetTransferParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [transfer] = await db.select().from(transfersTable).where(eq(transfersTable.id, params.data.id));
  if (!transfer) { res.status(404).json({ error: "Transfer not found" }); return; }
  const [[account], [claim], [item], history] = await Promise.all([
    db.select({ id: recipientAccountsTable.id, name: recipientAccountsTable.name, type: recipientAccountsTable.type }).from(recipientAccountsTable).where(eq(recipientAccountsTable.id, transfer.accountId)),
    db.select({ id: claimsTable.id, accountId: claimsTable.accountId, itemId: claimsTable.itemId, status: claimsTable.status }).from(claimsTable).where(eq(claimsTable.id, transfer.claimId)),
    db.select({ id: donationItemsTable.id, itemId: donationItemsTable.itemId, name: donationItemsTable.name, stage: donationItemsTable.stage }).from(donationItemsTable).where(eq(donationItemsTable.id, transfer.itemId)),
    db.select().from(transferHistoryTable).where(eq(transferHistoryTable.transferId, transfer.id)).orderBy(transferHistoryTable.timestamp),
  ]);
  if (!account || !claim || !item) { res.status(409).json({ error: "Transfer references missing related records" }); return; }
  res.json(GetTransferResponse.parse({ ...transfer, account, claim, item, history }));
});
router.patch("/transfers/:id/status", async (req, res): Promise<void> => {
  const params = TransitionTransferParams.safeParse(req.params); const body = TransitionTransferBody.safeParse(req.body);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const result = await db.transaction(async (tx) => {
    const [transfer] = await tx.select().from(transfersTable).where(eq(transfersTable.id, params.data.id)).for("update");
    if (!transfer) return { error: "Transfer not found" };
    const allowed = validateTransferTransition(transfer.status as TransferStatus, body.data.status as TransferStatus);
    if (!allowed.ok) return { error: allowed.reason };
    if (allowed.idempotent) return { transfer };
    const by = actor(res);
    if (body.data.status === "received") {
      const [item] = await tx.select().from(donationItemsTable).where(eq(donationItemsTable.id, transfer.itemId)).for("update");
      const [claim] = await tx.select().from(claimsTable).where(eq(claimsTable.id, transfer.claimId)).for("update");
      const [account] = await tx.select().from(recipientAccountsTable).where(eq(recipientAccountsTable.id, transfer.accountId));
      if (!claim || !item || !account || claim.status !== "approved" || claim.accountId !== transfer.accountId || claim.itemId !== transfer.itemId) return { error: "An approved, consistent claim is required to receive a transfer" };
      if (item.stage !== "scheduled") return { error: "Item must be scheduled before it can be distributed" };
      const [updated] = await tx.update(transfersTable).set({ status: "received", receivedBy: by }).where(and(eq(transfersTable.id, transfer.id), eq(transfersTable.status, "released"))).returning();
      if (!updated) return { error: "Transfer receipt was already processed" };
      const [fulfilled] = await tx.update(claimsTable).set({ status: "fulfilled" }).where(and(eq(claimsTable.id, claim.id), eq(claimsTable.status, "approved"))).returning();
      const [distributed] = await tx.update(donationItemsTable).set({ stage: "distributed", recipient: account.name }).where(and(eq(donationItemsTable.id, item.id), eq(donationItemsTable.stage, "scheduled"))).returning();
      if (!fulfilled || !distributed) return { error: "Claim or item changed while receiving transfer" };
      await tx.insert(transferHistoryTable).values({ id: randomUUID(), transferId: transfer.id, fromStatus: transfer.status, toStatus: "received", by, notes: body.data.notes ?? null });
      await tx.insert(claimHistoryTable).values({ id: randomUUID(), claimId: claim.id, fromStatus: "approved", toStatus: "fulfilled", by, notes: "Transfer received" });
      await tx.insert(stageHistoryTable).values({ id: randomUUID(), itemId: item.id, fromStage: "scheduled", toStage: "distributed", notes: `Transfer ${transfer.id} received` });
      await tx.insert(notificationOutboxTable).values([event("transfer", transfer.id, "received"), event("claim", claim.id, "fulfilled")]).onConflictDoNothing();
      const activityKey = `transfer:${transfer.id}:received`;
      const activityId = await recordServiceActivity(tx, {
        activityType: "distribution", loopStage: "served",
        relatedItemId: item.id, relatedClaimId: claim.id, relatedAccountId: account.id,
        publicTrackingCode: claim.trackingCode, status: "completed", staffOwner: by,
        completedAt: new Date(), publicSafeSummary: "Completed and distributed",
        internalNotes: body.data.notes ?? null, idempotencyKey: activityKey,
      });
      await recordAcknowledgment(tx, {
        parentActivityId: activityId,
        relatedItemId: item.id, relatedClaimId: claim.id, relatedAccountId: account.id,
        publicTrackingCode: claim.trackingCode, staffOwner: by,
      });
      return { transfer: updated };
    }
    if (body.data.status === "cancelled") {
      const [item] = await tx.select().from(donationItemsTable).where(eq(donationItemsTable.id, transfer.itemId)).for("update");
      if (item?.stage === "scheduled") {
        const [restored] = await tx.update(donationItemsTable).set({ stage: "matched", updatedAt: new Date() }).where(and(eq(donationItemsTable.id, item.id), eq(donationItemsTable.stage, "scheduled"))).returning();
        if (!restored) return { error: "Item stage changed while cancelling transfer" };
        await tx.insert(stageHistoryTable).values({ id: randomUUID(), itemId: item.id, fromStage: "scheduled", toStage: "matched", notes: `Transfer ${transfer.id} cancelled` });
      }
    }
    const [updated] = await tx.update(transfersTable).set({ status: body.data.status, ...(body.data.status === "released" ? { releasedBy: by } : {}) }).where(eq(transfersTable.id, transfer.id)).returning();
    await tx.insert(transferHistoryTable).values({ id: randomUUID(), transferId: transfer.id, fromStatus: transfer.status, toStatus: body.data.status, by, notes: body.data.notes ?? null });
    await tx.insert(notificationOutboxTable).values(event("transfer", transfer.id, body.data.status)).onConflictDoNothing();
    const [claim] = await tx.select().from(claimsTable).where(eq(claimsTable.id, transfer.claimId));
    await recordServiceActivity(tx, {
      activityType: "distribution",
      loopStage: body.data.status === "cancelled" ? "learned" : "scheduled",
      relatedItemId: transfer.itemId, relatedClaimId: transfer.claimId,
      relatedAccountId: transfer.accountId, publicTrackingCode: claim?.trackingCode ?? null,
      status: body.data.status, staffOwner: by,
      publicSafeSummary: body.data.status === "cancelled" ? "Distribution canceled" : "Ready for pickup",
      internalNotes: body.data.notes ?? null,
      idempotencyKey: `transfer:${transfer.id}:${body.data.status}`,
    });
    return { transfer: updated };
  });
  if ("error" in result) { res.status(result.error === "Transfer not found" ? 404 : 409).json({ error: result.error }); return; }
  res.json(TransitionTransferResponse.parse(result.transfer));
  void deliverAttendOutboxByDedupeKey(`transfer:${params.data.id}:${body.data.status}`);
});
export default router;