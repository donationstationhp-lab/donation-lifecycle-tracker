# Requirements backlog — extracted from Notion / Drive

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
