---
name: API artifact uptime checks
description: Why the mounted API root needs a public liveness response even when a separate startup health path exists.
---

Keep the mounted API artifact root public and data-free, returning HTTP 200 as
a liveness response. Keep all business and staff routes behind authentication.

**Why:** Production monitoring can probe the artifact's mounted root rather than
the custom startup-health path. If the auth gate handles that root, an otherwise
healthy deployment returns 401 and can be reported as an outage despite showing
no crash, restart, failed build, or application exception.

**How to apply:** When changing API routing or authorization order, preserve a
minimal public response at the mounted artifact root and at the explicit health
path. Verify both return 200 while a representative protected route still
returns 401 without credentials.