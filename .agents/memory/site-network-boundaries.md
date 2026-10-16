---
name: Site network boundaries
description: Product boundaries for own agents, partner nodes, receiving provenance and movement facts.
---

Donation Station calls its own operating sites **agents**. Partner organizations
are separate network nodes, not additional Donation Station agents. CIA owns the
own-site network and Donation Station operates it.

**Why:** The owner described both internal relief movements between its sites and
supply relationships with independent organizations. Combining those entities
would misrepresent custody and ownership.

**How to apply:** Preserve separate internal-move and organization-supply facts.
Do not repurpose claim-based recipient transfers as inter-site movement or
silently import a partner's records. Network visibility labels never authorize
public disclosure of private organizational or served-person information.

Receiving agent is original receipt provenance, not a claim about an item's
current physical site. Historical receiving sites and shelf ownership must not
be guessed from donor names, legacy location text or the existence of Headquarters.

**Why:** The user requested shared records, not separate site inventories or
retroactive invented custody. Existing records predate the site network.

**How to apply:** Resolve historical gaps only from staff-confirmed evidence.
Treat scheduled movement as intent, not proof of receipt or physical relocation;
a future current-stock/Placement projection requires an explicit custody design.

Production network initialization must be an explicit supervisor action, not
automatic startup seeding or copying all Development rows into Production.
For Replit-managed PostgreSQL, the supported Publish flow applies the schema
diff; do not introduce a separate production schema-push script or startup DDL.

**Why:** The owner requested safe production activation that never overwrites
existing sites or duplicates identities. Schema readiness and business seed
data are different release concerns; copying Development data would endanger
unrelated live records.

**How to apply:** Keep production schema changes in the managed Publish flow.
Require a deliberate supervisor action for missing standard-site records, stop
atomically on identity conflicts, and never use "overwrite production data" to
populate the three sites.
