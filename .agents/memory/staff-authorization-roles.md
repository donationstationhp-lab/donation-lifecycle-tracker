---
name: Staff authorization roles
description: Durable rules for granting staff and supervisor access to donor records.
---

Clerk authentication alone never grants operations access. A user must have an
exact `staff` or `supervisor` role in server-verified public metadata, and
supervisor-sensitive actions must also be checked on the server. The legacy
server-held API key remains privileged for trusted CLI automation.

**Why:** Self-service sign-up must not expose donor phone numbers, addresses, or
other operations data, and hiding supervisor controls in the browser is not an
authorization boundary.

**How to apply:** Keep public donor submission routes outside the staff gate.
For new protected routes, require a validated staff role; add a separate
server-side supervisor check for overrides or other sensitive decisions. The
web client must attach Clerk bearer tokens to protected API calls in
development, where the production-only same-origin Clerk proxy is disabled.