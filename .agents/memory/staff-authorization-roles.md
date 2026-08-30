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

Keep the trusted API-key path separate from Clerk authorization: an exact
server-held key may grant the privileged automation role, but any mismatch
must continue through normal authentication and fail closed rather than become
anonymous access.

**Why:** A malformed or stale CLI credential must never turn a protected
request into an unauthenticated one, and the browser must not receive
credential or donor-contact details in an authorization error.

**How to apply:** When changing the auth middleware, test signed-out,
unassigned, staff, supervisor, valid-key, and invalid-key cases independently;
assert both status/role behavior and that sensitive values are absent from
responses.