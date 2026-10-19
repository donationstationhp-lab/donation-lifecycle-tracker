---
name: "ATTEND" naming is not a retired system
description: "ATTEND" throughout this codebase names a Google Sheets notification outbox, not a legacy predecessor system with historical data to migrate.
---

"ATTEND" is a recurring name across this repo (`attendLifecycle.ts`,
`attendTransitions.ts`, `attendSheets.ts`, `attend_delivery_alerts`,
`routes/attend.ts`) and it is tempting to read it as a retired
predecessor system this app replaced, with historical data somewhere
waiting to be imported. It is not. It has never referred to an external
system with its own claims/accounts/history.

**What it actually is:** the name for this app's own outbound
notification mechanism — `notification_outbox` rows get delivered to an
external Google Sheet (`attendSheets.ts`, `ATTEND_SHEETS_SPREADSHEET_ID`)
so stakeholders can see claim/transfer status changes. `attend_delivery_alerts`
is the dead-letter table for failed deliveries. `attendTransitions.ts` is
this app's own claim/transfer state machine (`claimTransitions`,
`validateClaimTransition`) — not a mapping from anything external.

**Why this keeps getting re-investigated:** a Claude session
(`claude/migrate-attend-claims`, PR #11, Sept 17) built a historical-claims
migration script assuming a retired "ATTEND" system existed, found none,
and removed it a few hours later (`claude/remove-attend-migration-script`,
PR #12) — its commit message traced the misreading to a generated UI
mockup rendered by the mockup-sandbox preview tool in the live Replit
workspace, not a real system with historical data. A later session
independently hit the same question from a fabricated task notification
that referenced a nonexistent migration script, investigated from
scratch, and reached the same conclusion before building a new
*general-purpose* legacy-claims importer (`scripts/src/import-legacy-claims.ts`,
PR #23, originally named `migrate-attend-claims.ts` before being renamed
for the same reason this note exists) that is not actually tied to
ATTEND — it imports from whatever external legacy export a user points
it at, if one is ever produced. No real ATTEND export has ever been
located.

**How to apply:** don't assume "ATTEND" implies an external system with
data to recover. If a task references a retired ATTEND system,
historical ATTEND claims, or an ATTEND export, verify the premise before
building anything — check this note and git history
(`03c24a6`/`71e937e`) first.
