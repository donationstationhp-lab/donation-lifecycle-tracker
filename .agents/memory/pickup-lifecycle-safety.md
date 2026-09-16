---
name: Pickup lifecycle safety
description: Server-side rules that keep verified pickups, route stops, and intake records in sync.
---

Pickup dispatch is a server-authoritative transition: it requires the four verification signals and any required supervisor approval, while terminal pickups cannot re-enter contact or verification flows. A completed pickup has exactly one linked intake item.

**Why:** Pickup records contain operational commitments and donor context. Allowing a terminal request to regress, a repeated flag to be ignored, or one pickup to create multiple intake records can create duplicate work and conflicting audit history.

**How to apply:** When extending pickup endpoints, preserve the explicit state transitions, retain the transaction/one-to-one completion behavior, and use the validated pickup route-assignment flow rather than manually modifying pickup route stops.