# Notion identity import and S.N.O.W. backtest

This is a Development feature. It does not enable Notion writes or publish the app.

## Staff interface

Open **S.N.O.W. Backtest** in the staff sidebar (`/snow-backtest`).

- The report reads only PostgreSQL snapshots. Opening or refreshing it does not
  call Notion, run proposals, or change acceptance.
- **Import from Notion** requires an explicitly signed-in supervisor. It reads
  every page of the configured Item Log before beginning a single local import
  transaction. Failed reads do not produce partial imports.
- **Run rules-v1 proposals** is a separate staff action. It applies proposals to
  imported identities only, not every warehouse item. It never changes accepted
  classifications, stage, expiry, inventory quantities, or Notion.
- **Review** opens the existing staff S.N.O.W. review and accepted history.

## Identity and provenance

`DS-` and `DS-L-` strings retain their exact formatting and separate namespaces.
Notion page UUIDs are external references; every observed nonempty source ID is
retained as an alias. A missing ID stays null. External IDs remain unchanged and
are flagged. Duplicate or already-reserved IDs are isolated for review, not
renumbered or automatically merged. Staff exact lookup is available at
`GET /api/item-identities/lookup?key=<ID-or-Notion-page-UUID>`; ambiguous aliases
return 409 with all candidates.

These are identity/snapshot records, not fabricated warehouse intakes. Historical
services, money, incomplete conditions, and absent T.I.E.R. values must not become
physical stock or guessed classifications. Existing app items retain their UUIDs
and use the same identity registry. Imports and intake serialize through the
same DS counter lock. Canonical IDs, including historical aliases, reserve DS
numbers; legacy DS-L values never advance the DS counter. Counters never decrease.

On the first import of a new identity, a valid Notion S.N.O.W. value initializes
the accepted layer and audit with source **Notion import**. The original tier
author is not inferred from the item's receiver; accepted time records import
time, not an invented original decision time. Subsequent imports never replace
local accepted decisions, even if Notion's tier changes. The separately stored
Notion baseline can be compared with current local acceptance.

## Rules

Definitions are centralized in
`artifacts/api-server/src/lib/snowRulesV1.ts`. There are no model calls.

- Explicitly homemade, unlabeled, or undated food: URGENT, same-day distribution.
  Homemade food has a three-day ceiling from recorded receipt.
- Explicitly sealed and dated food: STABLE.
- Non-food or insufficient evidence: no proposal.
- No SURPLUS proposal: supply versus demand is not known.

Food evidence comes from recorded name, category, expiry date and item-scoped
notes. Missing date metadata does not prove that the physical food has no date.
Receipt dates are not package dates. Cross-item comparisons and policy examples
in notes are excluded from evidence. Unknown facts remain unknown. Report
disagreements compare the rule output with the Notion baseline, not with later
local acceptance. “No proposal” is an abstention, not an agreement or disagreement.
This historical comparison is not food-safety clearance.

Identical rule reruns preserve proposal IDs/timestamps and accepted history.
If evidence no longer supports a proposal, only a previous rules-v1 proposal is
cleared; proposals owned by another source and all accepted values are retained.

## Development maintenance

Run from the repository root:

```sh
# Read Notion and inspect IDs; no local import:
pnpm --filter @workspace/api-server exec tsx src/scripts/import-notion-identities.ts

# Import and verify exact page/alias identity links:
pnpm --filter @workspace/api-server exec tsx src/scripts/import-notion-identities.ts --apply

# Import, verify identity links, then run proposal-only rules and print a summary:
pnpm --filter @workspace/api-server exec tsx src/scripts/import-notion-identities.ts --apply --propose
```

The maintenance command loads the same configuration as the API entrypoint and
uses the existing startup-secret resolver. It never prints credentials and
refuses to run in a published/Production process.
