---
name: Clerk environment bindings
description: Distinguishes workspace Development Clerk credentials from the published Production binding.
---

The workspace shell and development API workflow can resolve a Development Clerk instance even when the published API uses a separate Production Managed Auth binding. A Production user ID may therefore return 404 from a local Clerk management call.

While the Replit-managed Clerk app remains attached, publishing injects its managed Production key and proxy configuration. Manually replacing similarly named Production secrets does not disconnect or override that managed binding; the Auth pane's “Delete Clerk app” action is required before an external Clerk instance can control published builds.

**Why:** Clerk user namespaces are instance-specific, and local admin scripts must not be treated as evidence about the published tenant. A fresh published bundle was observed receiving the managed `pk_live` domain and proxy path even though the published source had removed proxy mode and manual Production secrets had been changed.

**How to apply:** Do not copy or request secret values for this purpose. Treat local Clerk results as Development-scoped unless the binding is independently confirmed. To migrate to an external Clerk app, first disconnect the managed app through the Auth pane, then configure matching external keys and verify the live bundle after republishing.