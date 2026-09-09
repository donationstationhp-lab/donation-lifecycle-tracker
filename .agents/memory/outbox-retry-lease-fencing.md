---
name: Outbox retry lease fencing
description: How retryable external deliveries avoid stale-worker duplicates while recovering expired leases.
---

Fence each outbox processing lease with a unique claim token, and require the
token on every success or failure update. Claims, ownership rechecks, external
delivery, and the successful state transition must coordinate through the same
database-backed lock.

**Why:** A timeout alone does not make lease recovery safe. If a slow worker
outlives its lease, another worker can reclaim the row while the first external
request is still running. Status-only updates let both workers deliver and let
the stale worker overwrite the new worker's state.

**How to apply:** Count attempts when the lease is claimed, cap both failed-row
and expired-processing recovery, recheck the claim token immediately before the
external call, and persist success while the shared delivery lock is still held.

Create an operator alert in the same transaction that changes a delivery to its
final failed state, and enforce one alert per outbox row with a database
uniqueness constraint.

**Why:** Worker scans and lease recovery can revisit exhausted rows. A separate
best-effort alert write can be lost after the state change or duplicated by
concurrent workers.

**How to apply:** Sanitize external error text before inserting the alert, keep
payloads and provider credentials out of it, and use conflict-safe insertion as
defense in depth.