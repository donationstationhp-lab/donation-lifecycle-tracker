# Read-only baseline preflight

Run from the repository root:

```sh
pnpm --filter @workspace/scripts run preflight
pnpm --filter @workspace/scripts run preflight --offline
pnpm --filter @workspace/scripts run test:preflight
```

The current Replit workspace is the provisional application baseline, not
GitHub main. This command does not reconcile or modify those sources.

The normal command uses the process's existing `DATABASE_URL` without displaying
it or loading/replacing secrets. With no configured connection, an unavailable
database, or `--offline`, database checks are explicitly **UNVERIFIED**.
The command cannot independently identify a deployment's database. Choose the
target through the approved environment; do not paste credentials into chat.

## Safety

The inspection module does not import the application's database entrypoint,
resilient pool, API startup, counter allocator, migration tools, or workers.
It uses a separate PostgreSQL client, a read-only connection default, and an
explicit repeatable-read/read-only transaction. It verifies
`transaction_read_only` before inspecting and always rolls back and closes.
Connection and statement timeouts are five seconds. Every inspection statement
is a fixed SELECT; no IDs are allocated or reserved and no DDL is executed.
Output contains fixed diagnostics and aggregate counts, never individual IDs,
names, contacts, addresses, notes, source content, connection URLs or errors.
No Notion, Sheets, authentication, or other external API is called.

## Checks and limitations

- **Schema:** expected table/column names, PostgreSQL types and nullability are
  derived from the current Drizzle exports and compared with `public` catalog
  metadata. Missing/incompatible columns fail; extras warn. This is not an
  index/default/constraint audit or a migration-history certification.
- **Linkage:** app inventory UUID/display-ID agreement with the identity
  registry. Identity-only imported history is allowed, not fabricated inventory.
- **Preservation:** DS and DS-L lineage, preservation of imported source IDs
  as canonical IDs or aliases, Notion references, and numeric DS collisions.
  Missing/non-DS IDs are counted, not invented or renumbered. These checks can
  verify current stored evidence, not deleted records or unseen external history.
- **Counter:** `item_ds.next_number` must exceed all stored DS reservations and
  must not be below the established 6396 audit floor. This is **not a seed or a
  reset target**: higher counters and gaps are valid. DS-L does not advance DS.
  Existing four-digit capacity and its exhaustion sentinel are reported, not
  changed. A missing counter is a failure, never an invitation to create one.
- **Aliases:** detect lookup keys shared across different identities, including
  an alias colliding with another identity's canonical display ID.
- **Location:** count nonempty item location text with no exact location-code
  match. Do not infer sites, bins, custody, or placements.
- **Notion policy:** inspect the disabled-write policy, import gate, and local
  `notion*.ts` integration sources for query-reader/possible write evidence.
  This is explicitly static evidence, not proof about arbitrary dynamic paths,
  live Notion properties, deployed settings, or authorization health.

Exit codes: **0** = completed with PASS/WARN; **1** = at least one FAIL;
**2** = incomplete/UNVERIFIED with no FAIL. Warnings are visible but not fatal.
Schema drift skips dependent checks. Connection/query failures leave database
results uncertified and suppress raw error diagnostics.

Tests use synthetic catalog/aggregate fixtures and mocked clients only. They
do not connect to development or production databases.

## Unresolved design decisions

This command does not decide provisional public-submission identifiers versus
minting at acceptance, post-DS-9999 behavior, Party resolution, Site/bin
semantics, Placement/Movement design, weight units, or migration ordering.
Existing DS/DS-L identities and the counter high-water mark remain unchanged.
Credential revocation/rotation is a separate issuer-side security action; this
command neither reads credential files/history nor certifies rotation.
