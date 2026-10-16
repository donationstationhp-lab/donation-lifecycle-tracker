import { pool } from "@workspace/db";
import { initializeStandardAgents } from "../lib/networkInitialization";

// Explicit development setup only; never seeded by GET requests or auth startup.
try {
  if (process.env.NODE_ENV === "production") throw new Error("Run network seeding in Development only.");
  await initializeStandardAgents();
  console.log("Network seeds checked: three agents; no organizations seeded.");
} finally { await pool.end(); }
