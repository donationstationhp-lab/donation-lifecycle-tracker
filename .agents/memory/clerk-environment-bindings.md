---
name: Clerk environment bindings
description: Distinguishes workspace Development Clerk credentials from the published Production binding.
---

The workspace shell and development API workflow can resolve a Development Clerk instance even when the published API uses a separate Production Managed Auth binding. A Production user ID may therefore return 404 from a local Clerk management call.

**Why:** Clerk user namespaces are instance-specific, and local admin scripts must not be treated as evidence about the published tenant.

**How to apply:** Do not copy or request secret values for this purpose. Use a supported Production-runtime operation for Production user administration, and treat local Clerk results as Development-scoped unless the binding is independently confirmed.