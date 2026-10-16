# Public donation offers and physical receipt

This change applies only to new `/api/public/donate` submissions. Existing
inventory, historical pending-review items, DS/DS-L identifiers, staff intake,
pickup completion, the DS allocator and its capacity limit remain unchanged.
The baseline is the current Replit workspace, not GitHub main.

## Donor and staff workflow

- The public form saves a `donation_submissions` record with an internal UUID
  and unique donor-facing `SUB-<UUID>` reference.
- Public success returns only `reference` and the exact message
  **Offer submitted—not yet received**. The reference is not authentication
  and there is no public offer-detail lookup.
- Staff open **Pending Review** (`/pending`), then **Donation Offers**.
  The older pending-inventory controls remain separate and unchanged.
- Only `submitted` offers may become `approved` or `declined`. Repeating the
  same review is idempotent and preserves the first actor/time. Conflicting
  decisions or review after receipt return 409. Declined offers cannot be
  reopened or received in this smallest version.
- Approval is permission to proceed, not proof of goods received.
- Only `approved` offers expose **Confirm physical receipt**. Staff inspect or
  correct the details, verify the fields, then explicitly confirm receipt.
  Original offered JSON is never overwritten; received JSON is stored separately.
- The receipt transaction locks the submission, returns an already linked item
  on retry, allocates through the unchanged shared DS allocator, creates the
  inventory/identity/history/receipt activity, and links the item with actor/time.
  An acknowledgment activity is queued locally using existing behavior; this
  does not send SMS, Sheets or Notion notifications.
- One linked item per submission is enforced by the single link, row locking,
  and a unique received-item foreign key. The inventory link prevents deleting
  a received item while its receipt still references it.

The staff endpoints are `/api/donation-offers` (list),
`/api/donation-offers/:id/review`, and
`/api/donation-offers/:id/receive`. They reuse existing staff protection.
Mutations additionally require an authenticated Clerk staff identity for
provenance; a supplied `by` field or automation key cannot impersonate staff.

## Schema and verification

Only one new table is added. It has a unique reference, unique received-item
link, review/receipt metadata, and checks for allowed states and complete
review/receipt fields. No historical row backfill or counter update is required.
Preflight derives the new table automatically from Drizzle.

The public form already offers `excellent` condition. The inventory response
contract and condition chip now also recognize it so receiving such an offer
does not produce an unreadable item. Staff intake validation is unchanged.

`donationOffers.test.ts` and the updated allocator tests run exclusively in
isolated schemas containing table definitions and synthetic rows, with their
own counters. Tests cover submission/review without allocation, approved-only
receipt, explicit verification, concurrent/repeated receipt, late failure
rollback, uniqueness, historical preservation, privacy, and role boundaries.

## Scope limits

Single-row item/batch behavior remains: quantity is represented in the item
name as before, with the structured count retained on the submission. Weight
uses existing app semantics; no unit migration is performed. No pickup or
delivery is automatically arranged by approval. There are no donor follow-up
notifications, Notion writes, five-bone changes, or production deployment.
Repeated donor POSTs can create separate offers; receipt idempotency is scoped
to each submission, not automatic deduplication of different offers.
