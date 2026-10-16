# Staff site and partner network

## Inventory before implementation

The Development database had 35 application tables. Existing structures reused:

| Purpose | Existing table / decision |
|---|---|
| Shelves/zones | `locations`, extended with an agent FK; not repurposed as whole sites |
| Inventory receiving provenance | `donation_items`, extended with receiving agent FK |
| Partner nodes | organization-type `recipient_accounts`, extended with organizational network profile |
| Internal movements and partner supplies | immutable `service_activities`, extended with from/to agent FKs and structured goods facts |
| Claim-based fulfillment | existing `transfers`/`transfer_history`, unchanged |
| Own-site identity | no existing table fits without conflating shelves or recipient accounts; new `agents` |
| Exactly one explicit daily state | no existing table has this cardinality; new `agent_days` |

Agents and DS identifiers have independent numbering. Agent numbers use their own
serialized maximum-plus-one allocation, never the DS or claim counters.
SKUs belong to agents and do not replace DS or DS-L item identities.

## Staff workflows

The Network navigation opens the shared agent and partner records. Agent detail
pages are projections over receiving provenance, daily entries, and the service
ledger; they do not copy inventory into separate site databases.

New staff intake and offer receipt require an existing non-planned receiving
agent. Physical receipt records Intake in the same database transaction as the
inventory receipt. A retry returns the original linked offer receipt; no second
item or DS allocation is made. Receiving agent means original receipt, not an
item's current physical site.

Existing shelves and historical inventory remain unassigned unless staff have
evidence. The Network page exposes unassigned shelves for explicit mapping and
reports historical items with unknown receiving agent. New shelves require an
agent. Existing pickup and import behavior remains unchanged; it can therefore
still produce inventory without a receiving agent. That gap is visible, not
silently attributed to Headquarters.

## Day semantics

Operational dates use America/Chicago. Exactly one daily state is stored per
agent/date. Intake counts and first/last DS numbers are calculated from the
shared received-item records, not independently typed or incremented counters.
Idle and Closed require zero receipts; Intake requires at least one receipt.
Receipt and manual daily logging use the same transaction lock.

Missing dates are flagged once the Chicago calendar day has ended, starting on
the agent's network joined date. No historical operating schedule is invented.
Seasonal and planned agents still require an explicit state: silence is never
Closed or Idle. No background job fabricates day entries.

## Movement and supply facts

Internal moves and supply transfers append to the service ledger; they never use
claim transfers, issue DS numbers, change stages, reserve inventory, or rewrite
original receiving provenance. Goods lines may reference existing inventory, or
describe historical/container-level goods not individually inventoried.
These events document movements; they are not a new stock-balance/Placement model.
Scheduled events are intentions, not completed physical moves.

Acknowledgment changes append history with the same root ID under a transaction
lock. Latest state is projected before display. Confirmed-with-differences
requires a note. Confirming a scheduled supply is blocked before its date;
on/after that date explicit confirmation records it as after-transfer.

Organization profiles contain organization-level contact channels and goods
information only. Legacy account personal contact fields are not copied into
network profiles. Individual supply sources are incoming only and first-name-only.
Free-text fields must not contain details of people served.
Within/With/Beyond is metadata, not permission to publish: every network route
remains staff-only. No partner database is connected or imported.

## Setup and limits

Apply the additive Drizzle schema with the existing database push command, then
run `pnpm --filter @workspace/api-server exec tsx src/scripts/seed-network.ts`
in Development. Seeding is transactional/idempotent, preserves staff edits, and
stops on number/name identity conflicts. It does not seed partner organizations.
It is not run automatically in Production.

Notion writes remain disabled. T.I.E.R., S.N.O.W., DS/DS-L identities, the DS
allocator and claim-based transfer behavior are unchanged.
