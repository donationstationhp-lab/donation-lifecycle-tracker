# ADR: Item Domain Boundary and Two-Instrument Architecture

- **Status:** Accepted
- **Scope of this record:** Architecture and migration design only
- **Implementation status:** No schema, route, repository, workflow, or user-facing behavior change is authorized by this record
- **Decision principle:** “Let us follow best recognized recommendations.”

## Context

Donation Station will operate as two role-scoped instruments over one backend:

1. **Warehouse Floor** manages the physical state of donated items.
2. **Community/ATTEND** manages people, relationships, requests, allocation, scheduling, movement, tracking, and communication.

The instruments will not become independently authoritative applications. They will initially share one backend, one PostgreSQL database, one floor-owned item service, and one item-identity mint. Notion is a shared operational read projection, not a transactional system of record.

The earlier Replit app named `donation-lifecycle-tracker`, with the six-table warehouse core (`donation_items`, `donors`, `locations`, `stage_history`, `delivery_routes`, and `route_stops`), is sealed as the predecessor build. It contributed the warehouse core to the current product. If revived, it will become the Warehouse Floor interface as a client of this backend; it will not run an independent item database or mint item identities.

## Decision

### 1. Domain boundary

#### Community-owned tables

The Community service owns all writes to these 17 tables:

| Table | Community responsibility |
|---|---|
| `donors` | Donor identity, contact, organization, notes, and relationship history |
| `capacity_slots` | Appointment-window booking capacity |
| `appointment_history` | Appointment status audit history |
| `pickup_contact_attempts` | Pickup communication attempts |
| `pickup_flags` | Pickup exceptions and operational review |
| `delivery_routes` | Community pickup and delivery run planning |
| `recipient_accounts` | Recipient and community identities |
| `claims` | Requests, allocation decisions, and claim state |
| `tracking_counters` | Claim tracking-number allocation |
| `tracking_otps` | Public tracking verification |
| `claim_evidence` | Evidence attached to claims |
| `claim_history` | Claim decision and status audit history |
| `transfer_history` | Transfer workflow audit history |
| `notification_outbox` | Reliable outbound notification delivery |
| `attend_delivery_alerts` | ATTEND operational alerts |
| `community_ownership` | Staff-mediated links between records and community accounts |
| `confirmation_templates` | Reusable confirmation messages |

The Floor service may consume purpose-limited projections of these records when needed, but it does not write them.

#### Intended floor-owned tables

The Floor item service will own all writes to:

| Table | Floor responsibility |
|---|---|
| `donation_items` | Durable item identity and physical attributes, including floor status, condition, weight, expiry, QC result, and storage location |
| `locations` | Warehouse storage codes, zones, temperature zones, descriptions, and physical capacity |
| `stage_history` | Physical item status history only after the two-status migration |

The Community service will read these records through the item service or its local read projection. It will not write physical item fields or floor history directly.

`donation_items` currently includes community concerns such as donor text, recipient text, pickup linkage, pending review, and fulfillment stages. The narrowed floor model must remove, relocate, or replace those concerns with stable references and projections.

**Known defect:** an item's current location is stored as free text instead of a foreign key to `locations`. When the floor model is narrowed, this must be replaced with a nullable location reference backed by a foreign key. Migration must preserve unmatched historical text in a legacy/source field and place unresolved values in a reconciliation queue rather than silently discarding them.

#### Straddling tables

Each straddling table has one write owner. The other service may read only the minimum projection it needs.

| Table | Write owner | Read-only consumer | Boundary rule |
|---|---|---|---|
| `appointments` | Community | Floor | Community owns scheduling. Any reservation, release, handoff, or availability effect is requested through a synchronous Floor command; Community never changes physical item status directly. |
| `pickup_requests` | Community | Floor | Community owns submission, contact, approval, assignment, and pickup outcome. Floor reads an accepted pickup as intake source context and links it to the item without editing the request. |
| `route_stops` | Community | Floor | Community owns route membership, order, and notes. Floor may read the handoff plan but does not edit route execution records. |
| `transfers` | Community | Floor | Community owns transfer intent and workflow state. Floor owns the physical reservation, release, and availability effects requested by transfer commands. |
| `service_activities` | Community | Floor | Community owns the cross-workflow activity ledger. Floor publishes item events; Community projects them into service activities. Floor reads relevant activity projections and never inserts directly. |

No service may bypass its counterpart by directly updating a table owned by the other domain.

### 2. Separate physical and fulfillment statuses

The current shared `stage` field combines two independent facts. It will be replaced by separate columns:

- **Floor status:** `intake`, `qc`, `storage`, `released`
- **Community fulfillment status:** `unallocated`, `matched`, `scheduled`, `transferred`, `distributed`, `closed`

Floor status answers: **Where is the physical item in warehouse custody?**

Community fulfillment status answers: **What is happening to the item in the community allocation and fulfillment workflow?**

Neither status is derived solely from the other, and neither service writes the other service's status.

This follows the established Notion Item Log principle that **Lifecycle Phase** and **Stage** coexist as separate axes. The database statuses do not collapse those Notion concepts into one field, and the Notion fields must not be treated as interchangeable.

#### Migration path

The schema migration will be staged and reversible:

1. Add nullable `floor_status` and `fulfillment_status` columns while retaining the current `stage`.
2. Backfill both new columns using the mapping below.
3. Reconcile ambiguous rows against location, claim, transfer, appointment, and history records.
4. Update services to write only their owned status while temporarily maintaining the legacy `stage` as a compatibility projection.
5. Update reads and reports to use the two new statuses.
6. Stop writing the legacy `stage`, verify reconciliation, then remove it in a later migration.

Initial deterministic mapping:

| Current `stage` | New floor status | New fulfillment status |
|---|---|---|
| `intake` | `intake` | `unallocated` |
| `qc` | `qc` | `unallocated` |
| `storage` | `storage` | `unallocated` |
| `matched` | `storage` | `matched` |
| `scheduled` | `storage` | `scheduled` |
| `distributed` | `released` | `distributed` |
| `closed` | `released` | `closed` |

`transferred` has no exact legacy-stage equivalent. It must be derived from canonical transfer records during backfill. Conflicts between the simple mapping and transactional evidence must be reported for staff reconciliation; the migration must not guess silently.

Rows mapped from `matched` or `scheduled` to floor `storage` require validation because the legacy stage did not independently prove physical location. A missing or unresolved storage location is a reconciliation defect, not permission to infer one.

### 3. Item identity

One central, floor-owned item-identity service will:

- Use an opaque PostgreSQL UUID as the durable relational key.
- Mint one immutable human-readable `DS-####` identifier.
- Enforce uniqueness and serialize allocation in PostgreSQL.
- Support idempotent requests so retries cannot mint multiple identities.
- Preserve historical identifiers and aliases.

No UI, Community service, predecessor app, or Notion automation may independently calculate or mint the next `DS-####` value.

Public donor submissions receive a separate immutable submission ID owned by Community. A submission does not become a canonical item merely because it was submitted. The Floor item service assigns the DS identifier when staff physically accepts the item. If a future workflow needs a DS identifier before arrival, it must request one from the same central service rather than minting locally.

#### Existing Notion identities

The existing Notion items `DS-0001` through `DS-0005` must be imported before any new intake writes to Notion are enabled:

1. Read each Notion item and validate that its human ID is unique.
2. Create or match one PostgreSQL UUID identity for each item.
3. Store the Notion page/data-source identity as an external reference.
4. Store every historical or alternate identifier in an alias mapping with source and provenance.
5. Reject ambiguous aliases and duplicate DS identifiers into a reconciliation report.
6. Advance the PostgreSQL mint safely beyond all imported DS numbers.
7. Verify round-trip lookup by UUID, canonical DS ID, alias, and Notion reference.
8. Only after successful reconciliation may a separate change authorize new intake writes to Notion.

Import is idempotent: rerunning it must match existing imported identities rather than minting replacements.

### 4. Item contract

#### Floor-to-Community read projection

Community receives a versioned, public-safe item projection containing:

| Field | Purpose |
|---|---|
| `itemId` | Opaque durable UUID |
| `displayItemId` | Immutable `DS-####` identifier |
| `name` | Display name |
| `category` | Item category |
| `tier` | T.I.E.R. classification |
| `condition` | Physical condition |
| `weight` | Recorded numeric weight |
| `weightUnit` | `lbs` or preserved historical `kg (unconverted)` |
| `expiryDate` | Physical expiry date |
| `temperatureZone` | Storage temperature requirement |
| `warehouseLocationCode` | Current normalized floor location |
| `floorStatus` | `intake`, `qc`, `storage`, or `released` |
| `availability` | `unavailable`, `available`, `reserved`, or `released` |
| `pendingReview` | Intake review indicator during migration |
| `version` | Optimistic-concurrency version |
| `updatedAt` | Last authoritative update time |

Donor and recipient PII are excluded. Community resolves relational details from its own records.

#### Floor item events

The Floor service publishes:

- `ItemCreated`
- `ItemAccepted`
- `ItemQcPassed`
- `ItemQcFailed`
- `ItemStored`
- `ItemLocationChanged`
- `ItemWeightCorrected`
- `ItemExpired`
- `ItemUnavailable`
- `ItemReserved`
- `ItemReleased`
- `ItemClosed`

Every event includes a globally unique event ID, item UUID, canonical DS ID, item version, occurrence time, event type, idempotency metadata, and either changed fields or a complete versioned projection. Events are written through a transactional outbox in the same PostgreSQL transaction as the authoritative change.

#### Community-to-Floor commands

Community may request:

- Reserve an item for an approved claim
- Release or cancel an item reservation
- Schedule an item handoff
- Confirm physical handoff or release
- Change item availability for an authorized operational reason
- Report distribution completion
- Link accepted physical intake to a pickup submission

Commands carry an idempotency key, actor/context, expected item version where applicable, and stable Community references. Floor validates current custody, status, availability, and version before accepting them.

#### Timing and consistency

The following must be synchronous because stale decisions can allocate or release the wrong item:

- Reservation
- Reservation release or cancellation
- Physical handoff confirmation
- Availability changes

Accepted state changes and non-blocking projection updates are delivered through transactional outbox events, normally within seconds, with retries and idempotent consumers.

Periodic reconciliation supplements events; it does not replace them:

- Hourly during initial rollout
- Daily only after reliability is demonstrated and operational tolerance allows it
- On demand after incidents, imports, or detected version gaps

Reconciliation compares item identity, version, ownership, status, and projection checksums; it reports conflicts instead of applying silent last-write-wins updates.

### 5. Notion's role and property ownership

Notion is a shared operational read projection:

- It is never the transaction coordinator.
- It never allocates item IDs.
- It does not provide reservation or availability guarantees.
- It is updated only from committed PostgreSQL state through outbox-backed projection.
- Each property has exactly one owning service.
- The non-owning service never writes that property, including manual repair jobs.

The live Item Log property contract and ownership are:

| Notion property | Type | Owning service |
|---|---|---|
| `Artifact` | Files | Floor |
| `Batch/Lot ID` | Rich text | Floor |
| `Category` | Select | Floor |
| `Condition` | Select | Floor |
| `Date Received` | Date | Floor |
| `Donor` | Rich text | Community |
| `Expiry Date` | Date | Floor |
| `Item ID` | Rich text | Floor identity service |
| `Lifecycle Phase` | Select | Floor |
| `Location` | Rich text | Floor |
| `Name` | Title | Floor |
| `Recipient` | Rich text | Community |
| `S.N.O.W. Category Tier` | Select | Floor |
| `Stage` | Status | Community |
| `T.I.E.R.` | Select | Floor |
| `T.R.I. Routing` | Select | Floor |
| `Weight (lbs)` | Number | Floor |
| `Weight Unit` | Select | Floor |

Required controlled values currently include:

- `Lifecycle Phase`: `Intake`, `Signal`, `Grounded`
- `Stage`: `intake`, `matched`, `scheduled`, `qc`, `storage`, `distributed`, `closed`
- `S.N.O.W. Category Tier`: `URGENT`, `STABLE`, `SURPLUS`
- `T.I.E.R.`: `T — Time`, `I — Intelligence`, `E — Energy`, `R — Resources`
- `T.R.I. Routing`: `GIVE`, `GIVE-UTILITY`, `NEEDS-LABOR`, `RECYCLE-ONLY`
- `Weight Unit`: `lbs`, `kg (unconverted)`

The live Notion `Lifecycle Phase` and `Stage` values predate the target database statuses and are not a one-to-one encoding of `floor_status` and `fulfillment_status`. Their semantic mapping must be specified and validated before Notion writes are enabled. This ADR assigns ownership; it does not authorize writes or silently reinterpret existing Notion values.

Historical kilogram numbers remain unchanged and use `kg (unconverted)`. New canonical intake weight will use pounds.

### 6. Seamlessness requirement

The owner states: **“I forgot to add both should be seamless.”**

Seamlessness is a requirement, not a nice-to-have. The Warehouse Floor and Community instruments must feel like one system to the people using them.

There is a domain join between the instruments, but that join must be invisible in normal use. A user must never have to discover it, decide which copy is correct, run a synchronization process, switch identity, or work around a boundary.

The following are acceptance tests. The architecture is not seamless until all four pass in a deployed environment.

#### Acceptance test 1: One sign-in

**Requirement:** A staff member authenticates once and can move between the Warehouse Floor interface and the Community interface without re-authenticating, switching accounts, copying credentials, or encountering a second authorization flow.

**Verification:**

1. Sign in as a staff member through the supported staff entry point.
2. Open an authorized Floor view.
3. Navigate to an authorized Community view.
4. Return to the Floor view.
5. Confirm that all transitions use the same staff identity and session, preserve the assigned role, and require no additional authentication.

Role authorization may present an access-denied response when a staff member lacks permission, but it must not present a second sign-in or a separate account system.

**Current state:** API access currently relies on a shared API key rather than real staff authentication enforced end to end. That does not meet this requirement. Staff identity, shared session handling, and server-enforced role authorization across both instruments must be resolved before this acceptance test can pass.

#### Acceptance test 2: One item, one page

**Requirement:** An item reached from a shelf or inventory view and the same item reached from a claim, route stop, appointment, or transfer must resolve to one canonical item record and one item-detail experience.

**Verification:**

1. Select one item that appears in both a Floor workflow and a Community workflow.
2. Open it from the shelf/inventory view and record its URL or canonical item reference.
3. Open it from a claim, route stop, appointment, and transfer where applicable.
4. Confirm that every path resolves to the same canonical detail page and opaque item key.
5. Confirm that every entry point shows the same `DS-####` ID, artifact photo, physical state, fulfillment state, and last authoritative version.
6. Change an authorized field through its owning instrument and confirm that all entry points show the committed result without a second human update.

Different contextual panels are allowed, but divergent item-detail records or separately maintained item-detail screens are not.

#### Acceptance test 3: No double entry

**Requirement:** No field may be typed by a human into more than one system. Every field has one write owner; all other interfaces and Notion receive it through commands, events, or projections.

**Verification:**

1. For each editable item and workflow field, identify exactly one owning service and one user entry point.
2. Complete representative intake, QC, storage, claim, scheduling, route, transfer, and distribution workflows.
3. Confirm that no workflow asks a person to re-enter a value already committed elsewhere.
4. Confirm that Notion updates without manual re-entry.
5. Treat every duplicate entry prompt, spreadsheet handoff, manual Notion edit, copy-and-paste instruction, or second authoritative form as a failed test and a defect.

The one-owner-per-Notion-property rule exists to enforce this requirement. Neither instrument may offer an editable copy of a property owned by the other service.

Known or prohibited double-entry defects include:

- **Live defect:** Items `DS-0001` through `DS-0005` are currently logged by hand in the Notion Item Log while this app runs unconnected. This is the first seam to close.
- Re-entering item identity or physical attributes from a Community submission into the Floor instrument instead of accepting them through a reviewed handoff.
- Re-entering Floor item attributes in Community records for display or reporting.
- Manually copying claim, recipient, route, transfer, or fulfillment state into Notion.
- Allowing both services, repair scripts, or operators to write the same Notion property.
- Introducing a second item-detail form in the predecessor Warehouse Floor interface.

The future Notion write path exists to close the current manual Item Log defect. It must project committed state from the owning service; it must not create another form of dual writing.

#### Acceptance test 4: The ledger agrees without being asked

**Requirement:** The Notion Item Log reflects committed current state without anyone running a sync, pressing a button, re-entering data, or choosing which system should overwrite the other.

**Verification:**

1. Commit representative Floor-owned and Community-owned changes through their normal interfaces.
2. Confirm that outbox processing updates the owned Notion properties automatically within the documented delivery objective.
3. Confirm that retries are idempotent and do not create duplicate pages or regress newer values.
4. Interrupt Notion delivery, restore it, and confirm that queued projection updates recover automatically.
5. Run reconciliation and confirm that it reports no divergence after delivery completes.

Reconciliation exists to detect missed events, version gaps, unauthorized writes, and projection defects. It is an exception-control mechanism, not the normal synchronization path.

#### Why one backend is the more seamless architecture

The single-backend decision makes the two instruments more seamless, not less. It preserves one identity, one authorization boundary, one transactional item service, and immediate conflict checks while allowing each role to have a focused interface.

Two authoritative apps would create visible seams:

- Projection lag between independent item records
- Reconciliation reports that staff must interpret
- An item appearing available in one interface and reserved in the other
- Conflicting artifact photos, statuses, locations, or DS identifiers
- Separate authentication and authorization behavior
- Manual decisions about which app should win

If a future proposal recommends separate authoritative item databases, it must demonstrate how it still passes all four acceptance tests. Deployment separation alone is never permission to create a second item authority.

### 7. Extraction criteria

The Warehouse Floor instrument remains a client of the shared backend until all of the following are true:

1. Floor and Community services enforce table and field ownership inside one backend.
2. The two-status migration is complete and the legacy combined stage is retired.
3. The central identity service has imported and reconciled historical identities and aliases.
4. All cross-domain actions use versioned commands rather than direct table writes.
5. Transactional outbox publishing and idempotent event consumption are proven in production.
6. Community maintains a complete local item read projection without cross-domain joins.
7. Automated reconciliation detects missing events, version gaps, aliases, and status conflicts.
8. Failure behavior is defined for Floor unavailable, Community unavailable, Notion unavailable, delayed events, duplicate events, and rejected commands.
9. Monitoring and operational recovery procedures are tested.
10. There is a concrete organizational reason for separate deployment, such as independent teams, materially different uptime requirements, security/data-governance isolation, multiple warehouse clients, or independent scaling.

The domain boundary must run successfully **inside one backend first**, with working commands, events, projection, and reconciliation. Only then may a separate decision consider extracting Warehouse Floor into an independently deployed service. Extraction will not create a second item authority or database mint.

## Consequences

### Benefits

- Preserves PostgreSQL transactions and integrity while the boundary matures.
- Gives warehouse and community staff focused interfaces without duplicating authority.
- Prevents conflicting item IDs and physical state.
- Makes a later service extraction measurable and reversible.
- Keeps Notion useful to operators without placing correctness on an eventually consistent external system.

### Costs

- Requires a future two-status data migration.
- Requires explicit commands, events, projections, and reconciliation.
- Requires current mixed-domain writes to be moved behind owning services.
- Requires location normalization and historical data reconciliation.

These costs are accepted as staged internal refactoring work. This record does not authorize implementing them in the current pass.