# Move Donation Station to @dewaynelogan

This is a preparation checklist. The original app and its published site must
remain running. Nothing here authorizes changing the original Production
database, deleting the original app, changing DNS now, enabling Notion writes,
or automatically replaying notifications.

## 1. Save the private Development backup

Use only this refreshed package:

`generated-artifacts/account-move-2026-10-17/`

Download that directory, or its adjacent
`donation-station-development-2026-10-17.zip`, privately from the old workspace's
Files panel. It contains personal operational information. Do not upload it
to GitHub, paste it into chat, or put it in a public download folder.

- `development.dump`: complete PostgreSQL custom archive, schema and all data.
- `development.sql`: equivalent plain SQL copy; do not load both.
- `manifest.json`: row counts and verification results.
- `SHA256SUMS`: file checksums.
- `README.txt`: short restore instructions.

The October 16 directory and ZIP are now named
`.SUPERSEDED-DO-NOT-RESTORE`. Their Development data is obsolete. Their
Production data is also historical, not a refreshed live inventory snapshot.
The earlier failed dump directory is marked INCOMPLETE and is not a backup.
Do not use the restore commands in the old account-move guide.

The new package was made from one consistent read-only Development snapshot.
It includes all 38 public application tables, functions, triggers, constraints,
and data. PostgreSQL provider accounts/grants and Replit/Clerk accounts are not
portable database content. No Production connection was used.

### Expected counts

| Table | Rows |
| --- | ---: |
| agent_days | 0 |
| agents | 3 |
| appointment_history | 3 |
| appointments | 3 |
| attend_delivery_alerts | 0 |
| capacity_slots | 3 |
| claim_evidence | 3 |
| claim_history | 4 |
| claims | 3 |
| community_ownership | 0 |
| confirmation_templates | 0 |
| delivery_routes | 4 |
| donation_items | 16 |
| donation_submissions | 0 |
| donors | 0 |
| item_ds_reservations | 19 |
| item_external_references | 21 |
| item_identities | 37 |
| item_identity_aliases | 35 |
| item_snow | 6 |
| item_snow_backtests | 63 |
| item_snow_history | 5 |
| item_snow_proposal_history | 5 |
| item_tier_confirmations | 6 |
| locations | 1 |
| notification_outbox | 7 |
| notion_item_snapshots | 21 |
| pickup_contact_attempts | 5 |
| pickup_flags | 2 |
| pickup_requests | 4 |
| recipient_accounts | 3 |
| route_stops | 7 |
| service_activities | 122 |
| stage_history | 33 |
| tracking_counters | 2 |
| tracking_otps | 0 |
| transfer_history | 3 |
| transfers | 1 |

The identity registry has DS-0001 through DS-0005 with bigint values 1 through
5; those identity-only imports must not be fabricated into warehouse intake.
Fourteen August inventory records are now DS-L records. Their old DS labels
remain permanent aliases and reserved numbers. `item_ds.next_number` is 6,
not 6396; this is the corrected Development dataset only.

## 2. Import the code, not the private data

1. Sign in to Replit as **@dewaynelogan**.
2. Open https://replit.com/import and connect the GitHub account that can read
   https://github.com/donationstationhp-lab/donation-lifecycle-tracker.
3. Import the repository into a **new** app. The current move branch is
   `move-to-dewaynelogan-2026-10-16`, not necessarily GitHub's default `main`.
4. Before running the imported code or any schema commands, verify/choose that
   branch. If import used main, use the new app's Git pane or shell:

   ```sh
   git fetch origin
   git switch move-to-dewaynelogan-2026-10-16
   git log -1 --oneline
   ```

5. Compare the commit with the final preparation report. The branch includes
   the network build, site receipt choices, supervisor site setup, DS correction
   and extended preflight.
6. Keep the **new app's** services and notification workers stopped until its
   database, authentication and integrations are ready. Do not stop the old app.
   Stop any automatic startup in the new app before restoring.

## 3. Set destination secrets and settings

Secret values do **not** travel through GitHub. Enter them privately using the
new app's Secrets pane, in the correct Development/Production scope. Never
paste values into an Agent conversation or a tracked file.

### Secure values: re-enter or securely provision

| Name only | Use | What to do in the new account |
| --- | --- | --- |
| NOTION_API_KEY | Notion read/schema/import access | Securely re-enter the intended integration key, or grant destination vault access |
| DONATION_STATION_API_KEY | Authorized API automation | Securely provision/re-enter; update authorized clients if rotated |
| VAULT_SERVICE_TOKEN | Access to the startup-secret vault | Provision a destination token and privately register its hash/grants for NOTION_API_KEY and DONATION_STATION_API_KEY |
| STAFF_EMAIL_ALLOWLIST | Legacy staff allowlist support | Re-enter privately only if still needed; assigned Clerk roles remain required |
| CLERK_PUBLISHABLE_KEY | Backend Clerk binding | Prefer destination-managed provisioning; verify the correct environment |
| CLERK_SECRET_KEY | Backend Clerk authentication | Destination-managed provisioning; never blindly copy the old tenant binding |
| VITE_CLERK_PUBLISHABLE_KEY | Frontend Clerk binding | Must match the destination backend tenant; managed provisioning or secure configuration |

Do not copy the old DATABASE_URL: use the new app's own managed database
connection. DATABASE_URL and PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE are
destination-managed connection settings, not values to copy from this app.

### Required or policy-relevant settings: verify/re-enter if not preserved

| Names only | Use and action |
| --- | --- |
| NOTION_ITEMS_DATA_SOURCE_URL, NOTION_ROUTES_DATA_SOURCE_URL | Point to the intended existing Notion databases; verify per environment |
| STAFF_ACCESS_GRANT_EMAILS | Approved named staff grants; verify privately after import; do not publish its values |
| ATTEND_SHEETS_SPREADSHEET_ID, ATTEND_SHEETS_RANGE | Intended ATTEND workbook/range; configuration alone does not reconnect Google authorization |
| PUBLIC_TRACKING_OTP_ENABLED, TWILIO_TRUST_HUB_APPROVED | Preserve both existing disabled gates; do not enable SMS verification during this move |
| PUBLIC_APP_URL | Canonical public link origin; review before building or cutting over |
| BASE_PATH, PORT | Artifact-managed routing/listening settings; preserve the registered artifact paths |
| NODE_ENV, LOG_LEVEL | Environment and optional logging; verify destination runtime settings |

### Optional, generated, or unused settings

| Names only | Action |
| --- | --- |
| TWILIO_FROM_NUMBER | Optional sender override; configure privately if needed |
| SMS_STAGING_ACCOUNT_SID, SMS_STAGING_ENVIRONMENT, SMS_STAGING_FROM_NUMBER, SMS_STAGING_PHONE_NUMBER | Only for a separately approved staging test |
| PREVIEW_BASE_URL | Optional preview smoke-test address |
| REPL_ID, REPLIT_DEV_DOMAIN, REPLIT_DOMAINS, REPLIT_DEPLOYMENT, REPLIT_ENVIRONMENT | New app/platform supplies these; never copy the old project identity |
| CONNECTORS_HOSTNAME, REPLIT_CONNECTORS_HOSTNAME | Destination connector setup supplies these |
| GITHUB_PAT | Not an app runtime requirement; authorize GitHub under @dewaynelogan rather than copying the old credential |
| SESSION_SECRET | No current consumer found in this Clerk app; do not copy without identifying a need |
| Base_Path, Port | Legacy case-sensitive secret names with no exact current consumer; not substitutes for BASE_PATH or PORT |
| BASE_URL, DEV, PROD | Vite-generated, not hand-entered secrets |

Google Sheets and Twilio require **reauthorization in the new app**. Their
OAuth credentials are managed by Replit connections, not copied secret values.
An installed Vercel integration has no identified runtime dependency; reconnect
only if needed. Reconnect editor Notion/Maps connections separately if desired;
they are not the application's runtime Notion access.

If an earlier audit found a real exposed credential, privately rotate it with
its provider and update authorized consumers. Moving code does not revoke it,
and this preparation does not rewrite Git history or claim private rotation.

## 4. Restore into the new EMPTY Development database

Do not target this app's database or any Production database. Use the new app's
securely supplied DATABASE_URL without printing it.

1. Transfer the private package into an ignored directory in the new app.
2. Run `sha256sum -c SHA256SUMS` inside that package.
3. Confirm the destination is the new app's **empty Development** database.
   If import already created tables, stop and inspect; do not use `--clean`,
   delete tables, concatenate snapshots or force a restore over existing data.
4. With new services stopped, run:

   ```sh
   pg_restore --exit-on-error --single-transaction --no-owner --no-privileges \
     --dbname="$DATABASE_URL" development.dump
   ```

   A duplicate object or any other error must abort/roll back. Do not suppress
   errors. The alternative is `psql -X -v ON_ERROR_STOP=1 --single-transaction
   -f development.sql` with the new connection securely supplied. Never load
   both formats.

5. Compare every table count with `manifest.json` and the table above. Confirm:
   - item_ds counter = **6**, and 6 is not already reserved;
   - DS-0001…DS-0005 exist once, ds_number = 1…5;
   - DS-L-1001…DS-L-1010, DS-L-2558, DS-L-2590, DS-L-5038, DS-L-6395
     exist with their original UUIDs;
   - all fourteen original DS labels resolve unambiguously as aliases;
   - all four DS protection triggers and the reservation primary key exist;
   - three own sites exist; do not run a seed over restored sites.
6. Run:

   ```sh
   pnpm --filter @workspace/scripts run preflight
   pnpm --filter @workspace/scripts run test:preflight
   pnpm run typecheck
   ```

   Preflight must pass `dsProtections`, identifiers, aliases, linkage, counter,
   schema and Notion policy. The source has eight pre-existing location-text
   warnings; do not auto-map them or treat a warning as a resolved decision.
7. This package was already restored into a disposable Development schema:
   all 38 table counts and row-content fingerprints matched, counter was 6,
   fourteen aliases matched, and four protection triggers were restored.
   This does not replace verification in the new account.

## 5. Set up staff sign-in and read-only Notion access

1. In the new app's Auth pane, establish the correct Replit-managed Clerk
   bindings. Development and published Production are separate environments.
   Verify allowed origins, redirect URLs, sign-in providers and public/secret
   key pairing for each.
2. Establish a named **supervisor** through the authorized role-management
   process and assign staff roles to approved staff. Merely signing in or
   restoring PostgreSQL does not grant roles.
3. Clerk users, sessions and role metadata are not in this backup. A new tenant
   can issue different user IDs. Review restored actor/ownership references
   deliberately; never infer community ownership from matching email/contact
   fields or public tracking codes. Preserve historical audit actors; do not
   rewrite history to a new user.
4. Test that staff can view operations and a supervisor can reach site setup;
   public/community accounts must remain excluded from staff pages.
5. Configure Notion key/vault access and the two data-source settings; share
   the existing Item Log/Routes with the intended integration. Confirm startup
   schema validation and read access. Preserve imported page references and
   accepted classifications. Do not re-import to invent IDs or overwrite staff
   decisions. **Notion writes remain off** in `itemPairingPolicy`; there is no
   environment switch to turn them on for this move.
6. Reconnect Sheets/Twilio authorization without replaying failed events or
   sending a test SMS. ATTEND's source workbook is an external system, not part
   of the PostgreSQL backup.

## 6. Production setup later, ONLY in the new account

This section is a future gate, not work performed in the original Production DB.

1. Decide which dataset will be authoritative. This package is Development,
   **not live Production inventory**. Do not automatically merge it with the
   old Production export. If current live data must move, obtain a separately
   authorized fresh live snapshot during the eventual write freeze.
2. Use Replit's supported Publish flow for the new managed Production schema.
   Confirm the network tables, receiving-agent columns, bigint fields and
   reservation table are included. Do not add deploy/startup schema-changing
   hooks or run the Development correction against Production.
3. Decide explicitly whether the new, empty Production database should receive
   the corrected Development data through the supported initial data-copy
   option. Any overwrite/copy warning requires deliberate approval; it is not
   permission to replace existing live data. Verify the published server's
   actual database target rather than trusting a fixed health response.
4. Verify DS protection **functions/triggers** as well as tables: do not assume
   Publish's table/column diff transfers custom functions/triggers. If new
   Production preflight fails dsProtections, stop intake and resolve through
   the supported provider/platform path. No Production DDL workaround or
   startup installer is authorized by this checklist.
5. If the corrected Development dataset was deliberately copied, it already
   contains all three sites, the five pilot identities, 19 DS reservations,
   fourteen old-label aliases, and counter 6. Verify, do not reseed/reset.
6. If starting with a separately approved empty or Production-derived dataset,
   verify all identities first. Preserve DS and DS-L strings and external page
   references. Import/match DS-0001…DS-0005 idempotently only if absent and with
   no ambiguity; never turn identity-only imports into fictional intake.
   Set/reconcile a counter only under separate authorization: it must exceed
   every canonical DS number in that dataset, preserve a higher saved counter,
   and skip all historical aliases/reservations. **6 is not a universal
   Production reset target.** Uncorrected August DS labels can imply a much
   higher floor. This task did not authorize a Production relabel/reset.
7. If sites are absent after schema readiness, an assigned supervisor uses
   **Network → Supervisor site setup → Initialize standard sites** with explicit
   confirmation. It creates only missing, nonconflicting standard sites:
   #1 Headquarters (Hyde Park), #2 Market Headquarters,
   #3 Iyanna's (Englewood). Conflicts stop the whole operation. Do not seed
   partner organizations. Restored Development already includes these sites.
8. Confirm required receiving-site selection in staff intake and offer receipt,
   per-site pages, Idle/Closed/Intake day logging, internal moves and supply
   transfers. Check staff/supervisor protections in the published tenant.

## 7. Cutover and rollback

1. Keep the original preview/published services running until the replacement
   is independently verified. Do not attach two independent writers to the
   same global DS namespace. The new app must not accept real intake yet.
2. Obtain explicit cutover approval, choose the authoritative data, freeze
   writes for the final snapshot, and retain a rollback copy. This preparation
   snapshot is not a future final-write snapshot.
3. Review the intended hostname `scc.donationsstations.com`, DNS/domain
   assignment, HTTPS, Clerk allowed origins/redirects, PUBLIC_APP_URL and the
   old hardcoded public-link fallback. Confirm Donate/Track/QR links,
   /api/terms, /api/privacy, webhook/API clients and any outside Apps Script or
   Zapier configuration privately. No active Zapier callback was identified in
   code; external automation cannot be certified from source alone.
4. Only then publish/cut over the new app, validate its actual DB and staff
   access, and enable exactly one app for real writes. Leave Notion writes off.
   Do not replay failed ATTEND events without separate authorization.
5. If validation fails before new writes: keep/repoint traffic to the original
   app and leave the replacement closed to writes. Do not delete either app.
6. If new writes occurred: freeze both write paths and reconcile those records
   before rollback. Never restore an older dump over new donations, lower a
   counter, discard aliases or let duplicate notifications send.
7. Retire the old app only under a later, explicit decision after the new app
   and rollback window are accepted. No shutdown is part of this preparation.

Official references:
- https://docs.replit.com/build/import-from-providers
- https://docs.replit.com/core-concepts/project-editor/app-setup/secrets
- https://docs.replit.com/features/data-and-storage/development-and-production
