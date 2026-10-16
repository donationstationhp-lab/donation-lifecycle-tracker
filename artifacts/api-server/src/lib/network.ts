import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  db, agentsTable, agentDaysTable, locationsTable, donationItemsTable,
  recipientAccountsTable, serviceActivitiesTable,
} from "@workspace/db";
import type { NetworkCommand, NetworkPartnerProfile, NetworkSnapshot } from "@workspace/api-zod";
import { recordServiceActivity } from "./serviceActivities";
import { chicagoDay, missingAgentDays, NetworkError, requireDay, validateNetworkEvent } from "./networkRules";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function requireAgent(tx: Tx, id: string, receiving = false) {
  const [agent] = await tx.select().from(agentsTable).where(eq(agentsTable.id, id));
  if (!agent) throw new NetworkError(400, "Choose an existing agent.");
  if (receiving && agent.status === "planned")
    throw new NetworkError(400, "Planned agents cannot receive inventory.");
  return agent;
}

// Shared by manual day entry and receipts; serializes Idle/Closed versus Intake.
async function lockDay(tx: Tx, agentId: string, day: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`agent-day:${agentId}:${day}`},0))`);
}
export async function recordAgentReceipt(tx: Tx, agentId: string, actor: string, now = new Date()) {
  await requireAgent(tx, agentId, true);
  const day = chicagoDay(now);
  await lockDay(tx, agentId, day);
  await tx.insert(agentDaysTable).values({
    id: randomUUID(), agentId, day, state: "Intake", recordedBy: actor, recordedAt: now,
  }).onConflictDoUpdate({
    target: [agentDaysTable.agentId, agentDaysTable.day],
    set: { state: "Intake", recordedBy: actor, recordedAt: now },
  });
}

function emptyProfile(day: string): NetworkPartnerProfile {
  return {
    organizationType: "other", area: "", contactChannel: "", website: "", hours: "",
    accepts: "", refuses: "", capacity: "", urgentSignal: "", surplusSignal: "", idleSignal: "",
    visibility: "With", nodeStatus: "profile needed", dateJoined: day,
  };
}

export async function networkSnapshot(): Promise<NetworkSnapshot> {
  const [agents, accounts, days, items, locations, ledger] = await Promise.all([
    db.select().from(agentsTable).orderBy(asc(agentsTable.number)),
    db.select().from(recipientAccountsTable).where(eq(recipientAccountsTable.type, "organization")),
    db.select().from(agentDaysTable).orderBy(asc(agentDaysTable.day)),
    db.select({
      id: donationItemsTable.id, itemId: donationItemsTable.itemId, name: donationItemsTable.name,
      receivingAgentId: donationItemsTable.receivingAgentId, createdAt: donationItemsTable.createdAt,
    }).from(donationItemsTable),
    db.select({ id: locationsTable.id, code: locationsTable.code, zone: locationsTable.zone, agentId: locationsTable.agentId }).from(locationsTable),
    db.select().from(serviceActivitiesTable)
      .where(inArray(serviceActivitiesTable.activityType, ["internal_move", "supply_transfer"]))
      .orderBy(asc(serviceActivitiesTable.createdAt), asc(serviceActivitiesTable.id)),
  ]);
  const latest = new Map<string, typeof ledger[number]>();
  for (const row of ledger) latest.set(row.parentActivityId ?? row.id, row);
  const today = chicagoDay();
  return {
    agents: agents.map(a => ({ ...a, type: a.type as "CIA-provided" | "host-permitted", status: a.status as "active" | "seasonal" | "planned" })),
    partners: accounts.map(a => ({
      id: a.id, name: a.name,
      // Deliberately do not project legacy contactName or individual contact fields.
      profile: a.networkProfile ?? emptyProfile(chicagoDay(a.createdAt)),
    })),
    locations, items, today,
    days: days.map(d => {
      const ds = items.filter(i => i.receivingAgentId === d.agentId && chicagoDay(i.createdAt) === d.day)
        .map(i => i.itemId).sort((a, b) => Number(a.replace(/^DS-/, "")) - Number(b.replace(/^DS-/, "")));
      return { ...d, state: d.state as "Intake" | "Idle" | "Closed", itemCount: ds.length, firstDs: ds[0] ?? null, lastDs: ds.at(-1) ?? null };
    }),
    missingDays: missingAgentDays(agents, days, today),
    events: [...latest.entries()].flatMap(([rootId, row]) => row.networkDetails ? [{
      ...row.networkDetails, id: rootId, kind: row.activityType,
      fromAgentId: row.fromAgentId, toAgentId: row.toAgentId, organizationId: row.relatedAccountId,
    }] : []),
  };
}

function needed<T>(value: T | undefined, label: string): T {
  if (value === undefined || value === "") throw new NetworkError(400, `${label} is required.`);
  return value;
}
export async function saveNetworkCommand(input: NetworkCommand, actor: string): Promise<{ id: string }> {
  return db.transaction(async tx => {
    if (input.action === "createAgent" || input.action === "updateAgent") {
      const data = needed(input.agent, "Agent");
      if (![data.fullName, data.shortName, data.address].every(s => s.trim()))
        throw new NetworkError(400, "Agent name, short name and address are required.");
      if (input.action === "updateAgent") {
        const id = needed(input.id, "Agent ID");
        await requireAgent(tx, id);
        await tx.update(agentsTable).set({ ...data, sku: data.sku?.trim() || null }).where(eq(agentsTable.id, id));
        return { id };
      }
      // Independent namespace, not tracking_counters and never a DS allocation.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('network-agent-number',0))`);
      const [{ highest }] = await tx.select({ highest: sql<number>`coalesce(max(${agentsTable.number}),0)::int` }).from(agentsTable);
      const id = randomUUID();
      await tx.insert(agentsTable).values({ id, ...data, sku: data.sku?.trim() || null, number: highest + 1, joinedOn: chicagoDay() });
      return { id };
    }
    if (input.action === "createPartner" || input.action === "updatePartner") {
      const data = needed(input.partner, "Partner");
      requireDay(data.profile.dateJoined);
      if (!data.name.trim() || !data.profile.organizationType.trim())
        throw new NetworkError(400, "Organization name and type are required.");
      if (data.profile.website && !/^https?:\/\/[^\s]+$/i.test(data.profile.website))
        throw new NetworkError(400, "Website must be an http or https URL.");
      const id = input.action === "createPartner" ? randomUUID() : needed(input.id, "Organization ID");
      if (input.action === "updatePartner") {
        const [account] = await tx.select().from(recipientAccountsTable).where(eq(recipientAccountsTable.id, id));
        if (!account || account.type !== "organization") throw new NetworkError(404, "Organization not found.");
        await tx.update(recipientAccountsTable).set({ name: data.name.trim(), networkProfile: data.profile }).where(eq(recipientAccountsTable.id, id));
      } else {
        await tx.insert(recipientAccountsTable).values({ id, name: data.name.trim(), type: "organization", networkProfile: data.profile });
      }
      return { id };
    }
    if (input.action === "assignLocation") {
      const agentId = needed(input.agentId, "Agent"), id = needed(input.id, "Shelf");
      await requireAgent(tx, agentId);
      const [row] = await tx.update(locationsTable).set({ agentId }).where(eq(locationsTable.id, id)).returning();
      if (!row) throw new NetworkError(404, "Shelf not found.");
      return { id };
    }
    if (input.action === "createLocation") {
      const data = needed(input.location, "Shelf");
      await requireAgent(tx, data.agentId);
      if (!data.code.trim() || !data.zone.trim())
        throw new NetworkError(400, "Shelf code and zone are required.");
      const id = randomUUID();
      const [created] = await tx.insert(locationsTable).values({
        id, ...data, code: data.code.trim(), zone: data.zone.trim(),
      }).onConflictDoNothing({ target: locationsTable.code }).returning();
      if (!created) throw new NetworkError(409, "This shelf code already exists.");
      return { id };
    }
    if (input.action === "logDay") {
      const data = needed(input.day, "Agent-day");
      requireDay(data.day);
      const agent = await requireAgent(tx, data.agentId);
      if (data.day > chicagoDay() || data.day < agent.joinedOn)
        throw new NetworkError(400, "Log a date from the agent's joined date through today.");
      await lockDay(tx, data.agentId, data.day);
      const [count] = await tx.select({ n: sql<number>`count(*)::int` }).from(donationItemsTable).where(and(
        eq(donationItemsTable.receivingAgentId, data.agentId),
        sql`(${donationItemsTable.createdAt} AT TIME ZONE 'America/Chicago')::date = ${data.day}::date`,
      ));
      if ((data.state === "Intake") !== (count.n > 0))
        throw new NetworkError(409, "Intake requires received items; a day with received items cannot be Idle or Closed.");
      const [row] = await tx.insert(agentDaysTable).values({
        id: randomUUID(), ...data, recordedBy: actor,
      }).onConflictDoUpdate({
        target: [agentDaysTable.agentId, agentDaysTable.day],
        set: { state: data.state, recordedBy: actor, recordedAt: new Date() },
      }).returning();
      return { id: row.id };
    }
    if (input.action === "recordEvent") {
      const event = needed(input.event, "Event");
      validateNetworkEvent(event);
      await requireAgent(tx, event.agentId, true);
      if (event.toAgentId) await requireAgent(tx, event.toAgentId, true);
      if (event.organizationId) {
        const [partner] = await tx.select().from(recipientAccountsTable).where(eq(recipientAccountsTable.id, event.organizationId));
        if (!partner || partner.type !== "organization") throw new NetworkError(400, "Choose an organization, not an individual recipient account.");
      }
      const itemIds = event.items.flatMap(i => i.itemId ? [i.itemId] : []);
      if (new Set(itemIds).size !== itemIds.length)
        throw new NetworkError(400, "List each inventory item once.");
      if (itemIds.length) {
        const found = await tx.select({ id: donationItemsTable.id }).from(donationItemsTable).where(inArray(donationItemsTable.id, itemIds));
        if (found.length !== itemIds.length) throw new NetworkError(400, "An inventory item no longer exists.");
      }
      const { requestId, kind, agentId, toAgentId, organizationId, ...details } = event;
      const key = `network:${requestId}`;
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key},0))`);
      const [previous] = await tx.select().from(serviceActivitiesTable).where(eq(serviceActivitiesTable.idempotencyKey, key));
      const networkDetails = { ...details, acknowledgment: "pending" as const, acknowledgmentNote: "" };
      const fromAgentId = kind === "internal_move" || event.direction === "outgoing" ? agentId : null;
      const targetAgentId = kind === "internal_move" ? toAgentId! : event.direction === "incoming" ? agentId : null;
      if (previous) {
        if (previous.activityType !== kind || previous.fromAgentId !== fromAgentId || previous.toAgentId !== targetAgentId
          || previous.relatedAccountId !== (organizationId ?? null)
          || !isDeepStrictEqual(previous.networkDetails, JSON.parse(JSON.stringify(networkDetails))))
          throw new NetworkError(409, "This request was already saved with different details. Refresh before recording another event.");
        return { id: previous.id };
      }
      const id = await recordServiceActivity(tx, {
        activityType: kind, loopStage: event.recordingMode === "scheduled" ? "scheduled" : "served",
        fromAgentId, toAgentId: targetAgentId, relatedAccountId: organizationId ?? null,
        status: event.recordingMode === "scheduled" ? "scheduled" : "recorded",
        networkDetails, staffOwner: actor, idempotencyKey: key,
      });
      return { id };
    }
    if (input.action === "acknowledge") {
      const id = needed(input.id, "Supply transfer"), ack = needed(input.acknowledgment, "Acknowledgment");
      if (ack.acknowledgment === "confirmed with differences" && !ack.note.trim())
        throw new NetworkError(400, "Describe the confirmed differences.");
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`network-ack:${id}`},0))`);
      const rows = await tx.select().from(serviceActivitiesTable).where(and(
        eq(serviceActivitiesTable.activityType, "supply_transfer"),
        sql`(${serviceActivitiesTable.id} = ${id} OR ${serviceActivitiesTable.parentActivityId} = ${id})`,
      )).orderBy(asc(serviceActivitiesTable.createdAt), asc(serviceActivitiesTable.id));
      if (!rows.some(row => row.id === id && row.parentActivityId === null))
        throw new NetworkError(404, "Choose the original supply transfer, not an audit-history entry.");
      const current = rows.at(-1);
      if (!current?.networkDetails) throw new NetworkError(404, "Supply transfer not found.");
      if (current.networkDetails.eventDate > chicagoDay() && ack.acknowledgment !== "pending")
        throw new NetworkError(409, "A future scheduled supply cannot be confirmed as received.");
      if (current.networkDetails.acknowledgment === ack.acknowledgment && current.networkDetails.acknowledgmentNote === ack.note)
        return { id };
      const completed = ack.acknowledgment !== "pending";
      await recordServiceActivity(tx, {
        activityType: "supply_transfer", loopStage: completed ? "acknowledged"
          : current.networkDetails.recordingMode === "scheduled" ? "scheduled" : "served",
        parentActivityId: id, relatedAccountId: current.relatedAccountId,
        fromAgentId: current.fromAgentId, toAgentId: current.toAgentId,
        status: completed ? "acknowledged"
          : current.networkDetails.recordingMode === "scheduled" ? "scheduled" : "recorded",
        networkDetails: { ...current.networkDetails, acknowledgment: ack.acknowledgment, acknowledgmentNote: ack.note,
          recordingMode: completed && current.networkDetails.recordingMode === "scheduled" ? "after transfer" : current.networkDetails.recordingMode },
        staffOwner: actor, completedAt: completed ? new Date() : null,
        // PostgreSQL now() is transaction-start time, which can predate the
        // lock holder. Keep this aggregate's projection order strictly monotonic.
        createdAt: new Date(Math.max(Date.now(), current.createdAt.getTime() + 1)),
        idempotencyKey: `network-ack:${randomUUID()}`,
      });
      return { id };
    }
    throw new NetworkError(400, "Unknown network command.");
  });
}
