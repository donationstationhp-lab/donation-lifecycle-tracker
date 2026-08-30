---
name: Google Sheets append serialization
description: Why event-feed appends to a Google Sheet must be issued serially.
---

Serialize Google Sheets event-feed appends with a database-backed lock shared by
all delivery processes instead of issuing them concurrently against the same
table range. A process-local queue is only an optimization and is not sufficient
for autoscaled deployments.

**Why:** Google resolves an append from the current table boundary. Concurrent
requests for different durable events can select the same next row, leaving
fewer sheet rows than successfully completed requests.

**How to apply:** Any delivery path that appends multiple records to one sheet
range must use a distributed single-writer mechanism. Keep a local queue only to
reduce lock contention, and compare durable event keys with rows read back from
the sheet during end-to-end verification.