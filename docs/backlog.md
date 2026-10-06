# Requirements backlog — extracted from Notion / Drive

## 🚨 Blocker: this GitHub repo has diverged from the live Replit workspace

A 10/1/2026 Notion audit ("Skeleton Audit & Agent Model") read the live
Replit app's code and schema directly (replId
`43f34b6e-1a79-445b-b0fa-8b04e3cf75a5`) and found: **GitHub main declares 19
tables; the live Replit workspace has 25.** Six tables exist only in Replit
and have never been pushed: `appointments`, `capacity_slots`,
`community_ownership` (Clerk-based user accounts — so "Clerk" as an auth
provider, mentioned elsewhere in these notes, is real and already built,
just not in this checkout), `service_activities`, and others. The audit's
own conclusion: *"A GitHub-based review was retired for this reason. The
workspace needs to be committed and pushed before any plan is built from
GitHub."*

**This matters for anyone (human or agent) working from this GitHub
checkout, including future extraction/backlog work**: the schema explored
and referenced throughout this document is the *GitHub* schema, which is
known to be behind the live app. Treat every "gap" identified below as
provisional until the Replit workspace is committed and pushed — some may
already be solved in code that simply hasn't reached this repo yet.

### Concrete bugs found by reading the live app's actual source (not inferred)

- **Item IDs can collide.** All three intake paths (staff form, pickup
  completion, public donate) independently mint `DS-` + a random 4-digit
  number (1000–9999) with no uniqueness check — this is the same bug class
  that caused the real DS-/DS-L- numbering collision documented in the W.O.W.
  Pilot Build notes. A fix is already fully specified (see "Ready-to-build:
  Item Identity" below).
- **Donor/recipient identity is split five ways with no link between them**:
  `donors`, `recipient_accounts`, `pickup_requests` (inline name/phone/
  address), `appointments` (inline contact), `community_ownership` (Clerk
  users). `donation_items.donor` is required free text sitting beside an
  *optional* `donorId` — editing an item's donor text does not update
  `donorId`, so the two can silently disagree.
- **`donation_items.location` is free text, not a foreign key** —
  `locations` exists and is used by `appointments`/`capacity_slots` for
  scheduling, but items themselves don't reference it.
- **No two-way "Movement" record.** `stage_history` only tracks phase;
  `transfers`/`transfer_history` only model the Give/distribution side
  (a transfer means "claim fulfilled"). There's no equivalent record for the
  Receive side of an item's life.
- **Multi-item pickups collapse into a single item** — one pickup request
  creates exactly one `donation_items` row, named from the free-text "items
  received" field, so a pickup with multiple distinct items loses that
  distinction.
- **The weight-unit mismatch is confirmed from both sides**: Notion records
  weight in lbs with an explicit unit flag; this app's intake form labels
  the same field as kg with no unit flag at all. (Backs up the "Data model
  gaps" weight item further down.)
- **`powerConnectionReading` is an intentional numerology field, not dead
  code** — worth knowing before "cleaning it up": it's tied to this org's
  Supreme Mathematics framework. The intake form's "Read" button picks
  randomly from 5 fixed labels; if left blank, the server instead computes a
  value from the date. Both paths write the same column with different
  meanings — flagged in the Notion audit as worth resolving, not as a bug to
  silently delete.
- `artifacts/api-server/.../notion.ts` imports a `startupSecrets` file not
  present in its folder — flagged as unverified, not yet confirmed broken.

### Ready-to-build: Item Identity (Step 1 of a 4-step sequence)

The Notion audit wrote a fully-specified engineering brief for the first
fix (sequential, collision-proof `DS-` numbering), meant to be handed to an
agent working in the *live Replit workspace*. Reproduced here since it's
equally applicable once this repo is caught up to Replit — **do not build
this against the current GitHub checkout's `routes/items.ts` /
`routes/pickups.ts` / `routes/publicRoutes.ts` without first confirming
those files match what's live**, since the live versions may already differ:

> Replace the three random `DS-` generators with one shared function that
> atomically increments a `tracking_counters` row named `item_ds` inside the
> same transaction as the item insert. Format: `DS-` + number zero-padded to
> 4 digits, growing naturally past 9999. Seed the counter at 5 (DS-0005 is
> the highest real pilot number). Don't renumber existing random-ID items —
> list them in the report, and skip any number already in use until a
> decision is made. Public `/donate` submissions get a provisional `P-`
> prefix identifier; the real `DS-` number is assigned when staff approves
> the item (`POST /items/:id/approve`), recorded in `stage_history`. Never
> issue `DS-L-` (reserved for legacy). Keep the number agent/site-neutral —
> a later step adds per-site SKU prefixes (`A1-`, `A2-`, `A3-`) on top of it.
>
> Tests: concurrent intakes get distinct consecutive numbers; all three
> intake paths use the shared generator; an in-use number is skipped;
> rejected public submissions never consume a number.

Steps 2–4 in the same sequence (not yet detailed here): one Party resolver
across all intake paths matching on phone instead of name; Location
modeled as site (agent) + bin with per-agent SKUs; a real two-way Movement
record covering multi-item pickups.

### Also found: a second, separate dashboard app duplicating this data

A different Replit app, "Power Refinement Operating Hub" (replId
`843125d9-d53d-4e79-a19c-fe8774060434`), polls this app's Notion Item Log
every 60s for an activity feed, but keeps Relationships/Commitments/
Entities as unsynced browser-local-storage seed data — explicitly flagged
in Notion as "a second, unsynced register" that should become a read-only
view over Notion/this app's real data instead. Not part of this repo, but
worth knowing it exists and is drifting the same way GitHub drifted from
Replit.

---

Built by running `scripts/prompts/extract-lifecycle-conversation.md` against real
Donation Station planning material (not claude.ai chat history, which turned up
nothing usable — see the "zero-yield" note at the bottom). Sources: the
"Donation Station / CIA HQ" Notion workspace and the "Donation Station —
Warehouse Tables" Google Sheets. Confirmed connection: one Notion page
explicitly names **this repo** ("the Donation Lifecycle Tracker Replit app,
repl 43f34b6e") as the system these decisions were made for.

Checked each item against the schema as of 2026-10-06
(`lib/db/src/schema/*`), which now includes: `donation_items`, `donors`,
`stage_history`, `locations`, `delivery_routes`, `route_stops`, `staff_users`,
`sessions`, `pickup_requests`, `pickup_flags`, `pickup_contact_attempts`,
`confirmation_templates`, and the ATTEND-lifecycle set (`recipient_accounts`,
`claims`, `claim_evidence`, `claim_history`, `transfers`, `transfer_history`,
`notification_outbox`). A lot has landed since the Notion notes were written —
several "gaps" they flagged turned out to already be solved differently (noted
below), so don't assume the Notion doc's view of the schema is current.

## Confirmed terminology conflict — needs a decision, not a guess

Two unrelated things in this ecosystem are both called "tier":

- **`donation_items.tier`** (this repo): a single-value classification, column
  comment says `// T | I | E | R`, never defined anywhere in code.
- **T.I.E.R.** (Notion, "Our Work Map"): **Time, Intelligence, Energy,
  Resources** — an investment/stewardship framework tracked per-*Trade*
  ("each Trade records at least 1 TIER input: time donated, skill exchanged,
  resources moved"), not a property of an item.
- **S.N.O.W. tier** (Notion, "W.O.W. Pilot Build"): **URGENT / STABLE /
  SURPLUS** — a per-item/category urgency signal, staff-set and
  system-derived from category + expiry.

None of these three line up as the same thing. Before building anything on
`donation_items.tier`, confirm with the org which of these (if any) it's
supposed to represent — it may need renaming or splitting into two columns
(e.g. a real T/I/E/R classification plus a separate urgency tier).

## Proposed target entity model ("Skeleton Design," 9/21/2026)

A later design pass proposed collapsing the whole system onto five core
entities, explicitly reconciling the Mycelium Network's nine nodes and the
existing Notion databases down to this set. Worth treating as the target
shape for a future schema pass rather than something to adopt immediately,
but it's a cleaner framing than the current ad hoc field layout:

- **Item** — what is: DS ID, name, category, current tier, lifecycle phase,
  condition note, weight + method, source type.
- **Party** — who acts: name, roles (donor, recipient, volunteer, partner,
  staff), contact, entity-or-group. "Unknown" is an explicit, valid Party —
  not a null.
- **Site** — a place with its own standing (an address, a market, a church
  basement) — distinct from...
- **Placement** — item + custodian Party + Site + shelf/section; opened by
  one Movement, closed by another. (This is roughly today's `location`
  field, but modeled as a relationship instead of a string.)
- **Movement** — the one joint: every change of hands, place, or state.
  Type (Receive/Gain/Give/Transfer/Transform/Barter), status (reusing the
  Mycelium Network signal vocabulary: Received/Recognized/Verified/Matched/
  Reserved/Scheduled/Served/Acknowledged/Completed/Canceled/Expired/
  No-show/Overdue), and carries any T.I.E.R. contribution (so volunteer
  hours and resource/cash contributions stop living awkwardly on item rows).

Under this model, today's `donors`, `recipient_accounts`, `pickup_requests`'
inline contact fields, and `community_ownership` would all collapse into
**Party**; `claims`/`transfers`/`pickup_requests`/`route_stops` would
collapse into typed/stated **Movement** records instead of separate
one-purpose tables. This directly matches what the Skeleton Audit (above)
found wrong in the live code — Party split five ways, no two-way Movement
record — so the audit's bug list and this design doc agree on the shape of
the fix, just from different angles (one empirical, one top-down).

## Data model gaps (not yet in schema)

- **Weight unit + method.** `donation_items.weight` is a bare `real` — no
  unit, no estimate-vs-measured flag. Notion decision (9/13): add a
  `Weight Unit` property (`lbs` / `kg (unconverted)`); legacy kg values keep
  their number and get flagged, new entries are lbs, no silent conversion.
  The intake-card mapping also wants a separate `Weight Method` (`EST` vs
  `Scale`) since there's no scale yet.
- **Photo / artifact field.** No image/evidence column anywhere on
  `donation_items`. Repeatedly called "the single biggest structural gap" —
  "no artifact, no fact." If added: strip EXIF/GPS before storage (donation
  photos taken on-site would otherwise carry the donor's or site's GPS
  coordinates), resize, validate MIME, private by default.
- **Source/donor type + site.** Intake card wants `Source Type`, `Donor`,
  and `Site` as separate fields; currently only a free-text `donor` string.
- **Floor status / hold states.** Notion added `hold` and `hold — safety` as
  a status separate from `stage` — an item can be floor-held without
  changing its pipeline stage. No equivalent in this schema.
- **Outcome field + per-item slot/movement timeline.** Notion's Item Log logs
  a per-station timeline (Slot · Station · Time · Note) and a final
  `Outcome`. `stage_history` covers stage transitions but not this
  finer-grained station movement.
- **Category taxonomy.** No constrained category list — `category` is free
  text. Notion flagged real data loss from mismatched taxonomies between
  intake and downstream logs, and specifically had to add "tools & hardware"
  as a missing category after a real item couldn't be classified.

## Business rules to consider

- **T.R.I. routing (clothing, extended to hygiene/food/tools).** A 5-point
  checklist (fabric integrity, stains/odor, function, size/labeling, safety)
  producing one of four outcomes: `GIVE`, `GIVE-UTILITY`, `NEEDS-LABOR`,
  `RECYCLE-ONLY`. This replaces a binary QC pass/fail for these categories.
  Standing rule settled 9/13: an **opened-but-usable hygiene item routes
  `GIVE`** (not `GIVE-UTILITY`) with a **mandatory** condition note — not
  currently enforceable since there's no condition-note requirement tied to
  routing outcome.
- **Unlabeled homemade food is always `URGENT`, same-day only.** No 3-day
  shelf window, no storage — if it can't move today it doesn't get accepted.
  Flagged liability note: Illinois cottage-food labeling rules may apply to
  public (not direct/known-recipient) distribution — not legal advice, but a
  real compliance question before this becomes a public-facing flow.
- **No item passes intake without a unique ID, a photo, and an explicit
  source** ("Unknown" is a valid source value; blank is not). This came out
  of a real ID-collision incident (two numbering lineages collided; fixed by
  introducing a `DS-L-` legacy prefix) — worth checking whether this repo's
  actual item-ID generator (`generateItemId` in
  `artifacts/api-server/src/routes/publicRoutes.ts`, a random 4-digit
  `DS-####`) guards against collisions on insert, since the Notion-side
  incident happened for exactly this reason.
- **"No artifact, no fact."** Outcome metrics (e.g. people served, pounds
  diverted) shouldn't be cited anywhere public without a dated artifact
  backing them. Several named figures ("500+ served monthly," "40% transition
  rate") are explicitly flagged upstream as unverified — don't build
  reporting around them.

## Architecture decisions already made upstream (Notion-side) — reconcile, don't just adopt blindly

These were decided in the Notion workspace on 9/13 assuming a simpler schema
than exists now. Worth a deliberate reconciliation pass rather than importing
them verbatim:

- **Stage sequence expansion**: Notion wanted `matched` and `scheduled` added
  to the item's own `stage` enum (full sequence: intake → matched →
  scheduled → qc → storage → distributed → closed). But this repo already
  has separate `claims.status` and `transfers.status` enums that likely cover
  "matched" and "scheduled" conceptually at the claim/transfer level instead
  of the item level — check whether adding those stage values to
  `donation_items.stage` would actually duplicate state already tracked
  elsewhere before doing it.
- **Notion/Postgres split**: the plan was "Notion owns item identity and
  judgment (ID, category, tier, routing, weight, condition, lifecycle phase,
  stage, expiry, photo); Postgres owns operational relationships (claims,
  appointments, route stops, ATTEND activities, acknowledgments)." This repo
  has since built `claims`, `transfers`, `pickup_requests`, etc. directly in
  Postgres with no visible Notion sync code — so either this split was never
  implemented, or Postgres ended up as the sole source of truth instead of a
  secondary store. Worth confirming which is actually true before assuming
  any Notion-sync requirement still stands.
- **Outbox/idempotency for cross-system writes**: Notion flagged "no atomic
  transaction across Notion + Postgres, needs an outbox and reconciliation
  worker" as an open risk. This repo now has a `notification_outbox` table —
  unclear if it was built for this purpose or for something unrelated
  (general notifications). Worth checking before assuming the risk is closed.
- **Dashboard routes**: Notion's "Mycelium Network" doc lists
  `/dashboard`, `/dashboard/receiving`, `/dashboard/gaining`,
  `/dashboard/giving`, `/dashboard/bridging`, `/dashboard/relationships` as
  already-implemented domain dashboards reusing "live Donation Station
  metrics." Confirm whether these routes exist in
  `artifacts/donation-station` — the schema explored this session didn't
  show evidence of a `relationships` or `bridging` concept.
- **Auth mismatch**: the same doc says "Staff dashboards remain behind
  assigned Clerk staff or supervisor roles" — naming **Clerk** as the auth
  provider. This repo's actual staff auth (merged PR #6) is a custom
  email/password + httpOnly session-cookie system, not Clerk. Either the
  Notion note predates that decision or describes a different/aspirational
  auth plan — flag, don't silently treat Clerk as a requirement.

## Open questions

- Which "tier" is `donation_items.tier` meant to be? (see conflict above)
- Is the Notion workspace meant to become the system of record for item
  judgment/classification (per the 9/13 plan), or has Postgres already taken
  that role given how much has been built there since? This changes whether
  "sync Notion ↔ Postgres" is still a real requirement.
- Does `generateItemId` need a DB uniqueness check / retry-on-collision, given
  the Notion-side incident happened for exactly this class of bug?
- Do `/dashboard/bridging` and `/dashboard/relationships` exist anywhere in
  this codebase, or only in the Notion plan?

## Zero-yield sources (logged for completeness, nothing extracted)

Early passes of this extraction were run against claude.ai conversation
history and turned up nothing — the actual useful material was in Notion/
Drive instead, not past chats. Checked and empty: infra/tooling sessions
(CLAUDE.md setup, API proxy scaffolding, Notion integration scaffolding), an
unrelated app build ("The Civilization Code for AI"), a CI audit of an
unrelated repo (`con-scire`), and two philosophy/personal-reflection
conversations. None referenced donation intake, QC, storage, distribution,
donors, or routes.
