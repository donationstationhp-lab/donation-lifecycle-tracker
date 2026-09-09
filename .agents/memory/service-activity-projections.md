---
name: Service activity projections
description: Durable rules for immutable service-ledger writes, concurrency, and operational projections.
---

Service activities are immutable facts. Status changes append new events, and events for different lifecycle aggregates must never share a projection key merely because they reference the same appointment or pickup.

**Why:** Filtering historical events before identifying each aggregate's latest state can resurrect canceled or completed work. Concurrent status writers can also append contradictory outcomes unless they serialize on the same aggregate and recheck state under the lock.

**How to apply:** Use stable aggregate identities by lifecycle, preserve schedule snapshots across transitions, select latest state before calendar/dashboard filters, and lock/recheck the aggregate before appending mutually exclusive events.