---
name: Reservation ownership and lifecycle
description: Safety rules for public reserve-pickup requests while SMS ownership verification is unavailable.
---

Public tracking codes are not proof of claim ownership. While OTP/SMS verification is disabled, a public reserve-pickup request must remain unlinked until authenticated staff verifies and links an approved claim.

**Why:** Tracking codes are enumerable public references. Resolving or attaching a claim from that code alone lets a third party reserve another person's item and turns booking errors into a claim-existence oracle.

**How to apply:** Keep public errors uniform and public responses allowlisted. Link claims only through protected staff actions. Let transfer transactions own item scheduling/distribution, reject contradictory appointment states, and expire stale reservations with audited conditional transitions.