# Move Donation Station by GitHub import

**Historical package:** The October 16 export files predate the later authorized
Development DS correction. They still contain the old August DS labels, the
6396 counter and the pre-bigint schema. Do not restore them as the new corrected
Development baseline. This numbering change does not refresh exports or start
the account migration. Production has not been corrected or migrated.

This is a preparation guide, not authorization to publish, change DNS, replay
notifications, or migrate live data. Code and public schema are the current
Replit workspace baseline, not GitHub main. No application behavior was changed
to prepare this package.

## Code source

Import the migration branch reported by the Agent in
https://github.com/donationstationhp-lab/donation-lifecycle-tracker.
Do not assume the repository's default branch contains the network build.
The existing remote notion-backend branch has independent commits; it was not
overwritten or merged to prepare this move.

Private database exports are intentionally outside Git and deployment:
`generated-artifacts/account-move-2026-10-16/`.
Download the archive before leaving the old workspace. It contains personal
operational data; store it privately and never upload it to GitHub.

## What is and is not backed up

The Development and managed Production exports are separate single-statement,
consistent application-row snapshots. They are not a coordinated cutover
snapshot of both environments. The running app was not stopped; later writes
are not in these files. The published server's database target has not been
independently fingerprinted against the managed Production connection.

Each environment has a JSON snapshot, SQL data restore, column inventory,
foreign-key inventory, and table counts in manifest.json. current-schema.sql is
the latest Development public schema (37 tables, including network), without
role ownership or grants. It is intentionally the target schema for either
data snapshot, not a claim that Production already contains the network schema.
The Production column inventory preserves evidence of its older source schema.

Exports preserve UUIDs, DS-/DS-L- strings, aliases, external references,
classification history, claims, transfers, and saved counters without
allocating or reserving IDs. They do not merge the environments.

No environment settings, connection strings, OAuth credentials, vault
credentials, Clerk keys, or Clerk accounts are exported. tracking_otps is
omitted (both source tables were empty). Worker processing lease tokens are
cleared in the export, and delivery error text is redacted. Credential-like
strings are screened without logging their contents. This is not a forensic
guarantee about arbitrary historical free text.

At export time Development had 3 sites and item_ds next_number 6396; Production
had no agents/agent_days tables or item_ds counter row. These are historical
snapshot facts, not the post-correction Development baseline. Production still
requires a separately authorized reconciliation of all committed identifiers;
the Development-only correction does not authorize a Production counter reset.
Do not reclaim labels: old DS aliases remain permanently reserved.

Development outbox: 7 sent. Production outbox: 2 failed. Their statuses are
preserved. Do not replay the two failed events during migration. Reconnect the
Google authorization and obtain explicit staff approval before any replay.

## Restore into a new empty database

Choose ONE snapshot per destination. For a Development continuation choose the
Development export. For a live-inventory continuation, the Production export
contains different business data and needs the counter/identity preflight
above. Do not concatenate or automatically merge the snapshots.

Keep destination app workflows and notification workers stopped until restore
and configuration review are complete. Use the new app's own managed database
connection, not the old app's connection. Do not paste a connection string into
chat or a shell command literal.

From the directory containing the extracted files, with DATABASE_URL supplied
securely by the destination environment:

```sh
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 --single-transaction -f current-schema.sql
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f development-data.sql
# OR production-data.sql, never both into the same destination.
```

Do not run these against the original databases. If importing the repository
has already created empty tables, do not apply current-schema.sql again; first
verify that the existing schema matches the current Drizzle schema, then use
only the chosen data SQL. A nonempty target is refused by the data restore.
It locks the target tables, checks all 37 are empty, restores in foreign-key
order, and commits all data together. On failure it rolls back; do not suppress
errors. These commands were generated and structurally checked, not executed
against a new destination in this workspace.

Verify SHA256SUMS before loading. Compare destination counts against
manifest.json and run the existing read-only preflight command. Do not seed
over restored sites or reset counters. The public schema file does not include
provider-internal schemas, PostgreSQL roles, or grants.

For the new managed Production database, follow Replit's supported Publish
schema flow. Its database is separate from Development. Do not use the
"overwrite production data" option casually: it replaces live data. Establish
which snapshot is intended before authorizing a new Production load.

## Configuration inventory (names only)

Create settings in the appropriate destination Development/Production scope.
Nonsecret .replit settings are in Git; verify that the import preserves their
scope. Secret values do not travel through GitHub.

| Name | Used by | Destination action |
| --- | --- | --- |
| DATABASE_URL | lib/db PostgreSQL clients; Drizzle; preflight | New managed DB supplies it; never copy old URL |
| PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE | PostgreSQL tools/platform connection metadata | Destination-managed; do not hand-copy old credentials |
| NOTION_API_KEY | API startup secret resolution and Notion reads/schema checks | Securely configure fallback or authorize vault access; never export value |
| DONATION_STATION_API_KEY | API automation authorization; startup resolution | Securely provision/re-enter or authorize vault; update authorized clients if rotated |
| VAULT_SERVICE_TOKEN | API startupSecrets vault client | Securely provision/re-enter; register token hash and grants for both required keys with vault administrator |
| NOTION_ITEMS_DATA_SOURCE_URL, NOTION_ROUTES_DATA_SOURCE_URL | API Notion database references | Verify/re-enter per scope if import does not preserve them |
| CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, VITE_CLERK_PUBLISHABLE_KEY | API Clerk middleware and React sign-in | Destination-managed Clerk provisioning; verify Dev/Production bindings; do not blindly reuse old app bindings |
| STAFF_ACCESS_GRANT_EMAILS | Named staff access grants | Verify imported .replit setting; private staff identities, not values in this guide |
| STAFF_EMAIL_ALLOWLIST | API legacy allowlist support | Securely re-enter if still needed; not a replacement for assigned Clerk staff/supervisor roles |
| ATTEND_SHEETS_SPREADSHEET_ID, ATTEND_SHEETS_RANGE | ATTEND Google Sheets connector delivery | Verify imported .replit settings; select same intended workbook/range |
| PUBLIC_TRACKING_OTP_ENABLED, TWILIO_TRUST_HUB_APPROVED | Public tracking SMS gate (both required) | Preserve current disabled policy; migration is not authorization to enable |
| TWILIO_FROM_NUMBER | Optional Twilio sender selection | Re-enter if explicitly configured; otherwise connector selects sender |
| SMS_STAGING_ACCOUNT_SID, SMS_STAGING_ENVIRONMENT, SMS_STAGING_FROM_NUMBER, SMS_STAGING_PHONE_NUMBER | Controlled staging SMS verification command | Optional; configure privately only for approved staging tests |
| PORT, BASE_PATH | Managed service and Vite routing/build | Use destination artifact-managed settings, preserve path routing |
| NODE_ENV, LOG_LEVEL | Runtime mode and logging | Preserve deployment mode; optional logging override |
| PUBLIC_APP_URL | Frontend public tracking link builder | Review new canonical URL and build-time exposure; see address notes below |
| PREVIEW_BASE_URL | scripts preview smoke check | Optional; point to new preview when running it |
| REPL_ID, REPLIT_DEV_DOMAIN, REPLIT_DEPLOYMENT, REPLIT_ENVIRONMENT | Platform detection, preview tooling and environment handling | Destination supplies them; never copy old project identity |
| CONNECTORS_HOSTNAME, REPLIT_CONNECTORS_HOSTNAME | Replit connector SDK/platform connection discovery | Destination-generated on connection setup, not hand-copied |
| GITHUB_PAT | Existing workspace Git credential, not application runtime | Do not copy by default; authorize GitHub in destination account |
| SESSION_SECRET | Present as a secret; no active application-code reference found | Not required by current Clerk flow; do not copy without identifying a consumer |
| Base_Path, Port | Present as secrets; no exact-name application-code references found | Case-sensitive legacy names; not substitutes for BASE_PATH / PORT; do not copy blindly |
| BASE_URL, DEV, PROD | Vite-generated frontend environment values | Build-generated, not manual secrets |

Notion writes are hard-disabled in itemPairingPolicy, not enabled by a
migration environment variable. Leave this policy unchanged.

## Services, accounts, and address-bound configuration

- This app uses Replit-managed Clerk, with separate Development/Production
  tenants. Users, sessions, publicMetadata roles and provider configuration are
  not PostgreSQL data. Establish destination access and an assigned supervisor;
  if it creates a new tenant, validate staff identities and explicit community
  ownership links rather than matching accounts by email or public codes.
  Migration of the existing Clerk tenant/users requires separate authorization
  and a supported provider/account procedure; this package does not do it.
- Reconnect Google Sheets and Twilio in the destination app with the intended
  service accounts and permissions. Integration authorization is not Git data.
  An installed Vercel connection was reported by the workspace, but no current
  application runtime dependency on it was found.
- Runtime Notion uses an API key/vault and the configured data-source URLs.
  Share the existing databases with the intended integration. Editor Notion
  and Google Maps MCP connections are separate and need reconnecting only if
  needed for Agent tooling. Do not import partner databases or enable writes.
- Confirm vault service-token registration/grants; a copied token name alone
  does not give the new app working access.
- Review custom-domain assignment/DNS and HTTPS only at an authorized cutover.
  The current custom hostname is scc.donationsstations.com. Preserve the old
  deployment until the new one is verified; this task does not change DNS.
- Review Clerk allowed origins, redirect/sign-in URLs, authorized parties,
  custom domain and any OAuth callback settings for the new preview/published
  origin. Do not copy the old Replit app identifier.
- publicTracking.ts has a fallback pointing at the old replit.app address.
  PUBLIC_APP_URL is referenced via import.meta.env, and this project's Vite
  configuration explicitly exposes PUBLIC_ names. Set the intended destination
  URL before building and verify the built link before cutover. No application
  URL or behavior was changed here.
- Review public website Donate/Track links, QR codes, bookmarks, legal-page
  links (/api/terms and /api/privacy), Apps Script/webhook destinations and
  authorized API clients if the public hostname changes. A custom domain kept
  unchanged may preserve URLs but still needs destination/domain validation.
- No active Zapier callback configuration or Apps Script webhook credential
  was identified in current runtime code; ATTEND currently calls the Google
  Sheets connector directly. Check external automation dashboards privately;
  code inspection cannot certify there are no outside integrations.

## Ordered account-move checklist

1. Download and privately retain the export archive and checksums.
2. In dewaynelogan, authorize GitHub access and import the reported migration
   branch/commit; verify the branch rather than defaulting to main.
3. Keep new app services/notification workers stopped. Confirm artifact paths,
   pnpm workspace commands and destination-managed database configuration.
4. Restore the chosen snapshot into an empty destination as above; never merge
   Dev and Production automatically. Verify counts, identities and counters.
5. Re-establish Clerk access/roles, private secrets, vault grants and connector
   authorizations. Keep Notion writes and SMS verification disabled.
6. Run read-only preflight, typechecks and scoped tests with isolated fixtures.
   Resolve Production-derived identity/counter gaps and verify public link
   origins before accepting any real intake.
7. Verify receiving-site selection and Network pages. Development restore
   includes all three sites; a Production-derived restore has none. An
   assigned supervisor can use Network > Supervisor site setup >
   Initialize standard sites only after the current schema is available.
8. When separately authorized, schedule the final write freeze/fresh export,
   verify the published database target, then publish/cut over and update
   domain-dependent clients. Do not run two writers against the same global
   DS namespace, and do not replay failed ATTEND events without approval.

Official platform references:
- https://docs.replit.com/build/import-from-providers
- https://docs.replit.com/teams/identity-and-access-management/manually-copy-projects
- https://docs.replit.com/cloud-services/storage-and-databases/production-databases
