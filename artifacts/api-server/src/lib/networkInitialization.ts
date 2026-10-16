import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, agentsTable } from "@workspace/db";
import { chicagoDay, NetworkError } from "./networkRules";

export const STANDARD_AGENTS = [
  { number: 1, fullName: "Headquarters (Hyde Park)", shortName: "Headquarters", address: "5303 S. Woodlawn", type: "CIA-provided", status: "active", notes: "Intake point for Hyde Park sources." },
  { number: 2, fullName: "Market Headquarters", shortName: "Market HQ", address: "Chicago Vegan Farmers Market", type: "host-permitted", status: "seasonal", notes: "" },
  { number: 3, fullName: "Iyanna's (Englewood)", shortName: "Iyanna's", address: "1809 W. 69th", type: "CIA-provided", status: "active", notes: "Shipping container and work vehicles are located here." },
] as const;

type ExistingAgent = { id: string; number: number; fullName: string };

/** Validate the entire set before the first insert; never repair by guessing. */
export function planStandardAgents(existing: ExistingAgent[]) {
  return STANDARD_AGENTS.filter(seed => {
    const numbered = existing.filter(a => a.number === seed.number);
    const named = existing.filter(a => a.fullName === seed.fullName);
    if (numbered.length === 1 && numbered[0].fullName === seed.fullName
      && named.length === 1 && named[0].id === numbered[0].id) return false;
    if (numbered.length || named.length)
      throw new NetworkError(409, `Standard site #${seed.number} has a number/name identity conflict. No sites were changed. Resolve it with a supervisor before retrying.`);
    return true;
  });
}

/** Data-only initialization in the running app's own database; no DDL or IDs from DS counters. */
export async function initializeStandardAgents() {
  return db.transaction(async tx => {
    // Same namespace lock as ordinary agent creation and the Development CLI.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('network-agent-number',0))`);
    // Block site edits while checking identities. This does not lock inventory.
    await tx.execute(sql`LOCK TABLE agents IN SHARE ROW EXCLUSIVE MODE`);
    const existing = await tx.select().from(agentsTable);
    const missing = planStandardAgents(existing);
    if (missing.length) await tx.insert(agentsTable).values(missing.map(seed => ({
      ...seed, id: randomUUID(), sku: null, owner: "CIA", operator: "Donation Station", joinedOn: chicagoDay(),
    })));
    return { created: missing.length, existing: STANDARD_AGENTS.length - missing.length };
  });
}
