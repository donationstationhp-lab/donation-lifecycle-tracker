import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool, agentsTable } from "@workspace/db";
import { chicagoDay } from "../lib/networkRules";

// Explicit development setup only; never seeded by GET requests or auth startup.
try {
  if (process.env.NODE_ENV === "production") throw new Error("Run network seeding in Development only.");
  await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('network-agent-number',0))`);
    const existing = await tx.select().from(agentsTable);
    const seeds = [
      { number: 1, fullName: "Headquarters (Hyde Park)", shortName: "Headquarters", address: "5303 S. Woodlawn", type: "CIA-provided", status: "active", notes: "Intake point for Hyde Park sources." },
      { number: 2, fullName: "Market Headquarters", shortName: "Market HQ", address: "Chicago Vegan Farmers Market", type: "host-permitted", status: "seasonal", notes: "" },
      { number: 3, fullName: "Iyanna's (Englewood)", shortName: "Iyanna's", address: "1809 W. 69th", type: "CIA-provided", status: "active", notes: "Shipping container and work vehicles are located here." },
    ];
    for (const seed of seeds) {
      const byNumber = existing.find(a => a.number === seed.number);
      const byName = existing.filter(a => a.fullName === seed.fullName);
      if (byNumber) {
        if (byNumber.fullName !== seed.fullName || byName.some(a => a.id !== byNumber.id))
          throw new Error("Agent seed identity conflict; no rows were changed.");
        continue; // Staff edits and blank/nonblank SKUs survive a rerun.
      }
      if (byName.length) throw new Error("Agent seed identity conflict; no rows were changed.");
      await tx.insert(agentsTable).values({ id: randomUUID(), ...seed, sku: null, joinedOn: chicagoDay() });
    }
  });
  console.log("Network seeds checked: three agents; no organizations seeded.");
} finally { await pool.end(); }
