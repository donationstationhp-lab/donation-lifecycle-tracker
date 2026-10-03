---
name: Database outage safety
description: Operational expectations for database interruptions, recovery, and safe diagnostics.
---

Database interruptions must not make the API's liveness checks fail or stop its database-independent features.

**Why:** The user explicitly requires a database blip not to crash or suspend the published deployment. A database-dependent liveness response would undermine that requirement even if the process remained running.

**How to apply:** Keep liveness distinct from database readiness when adding monitoring, startup dependencies, or new routes.

Recovery must not replay user writes automatically.

**Why:** A lost connection can leave a commit outcome unknown; replaying the request can duplicate a completed mutation. Connection recovery is not evidence that a previous write failed.

**How to apply:** Retry connection probes and known-idempotent maintenance only. Preserve explicit failures for application requests.

Log connection-error classifications, not raw PostgreSQL pool errors or clients.

**Why:** An unhandled pool error in deployment logs included the associated client object, which can contain connection credentials. Drizzle errors can also embed query parameters.

**How to apply:** Use safe code/state metadata for outage and recovery diagnostics; do not attach driver objects or raw query errors.