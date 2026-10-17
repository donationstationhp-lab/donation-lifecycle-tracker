---
name: Maintenance process configuration
description: Why a bare maintenance command can report missing Notion credentials while the API works.
---

Do not treat missing credentials in a bare shell maintenance process as proof that the running API's credentials are absent or broken. Maintenance entrypoints must initialize the same configuration and startup-secret resolution as the API.

**Why:** A bare inspection reported Notion unavailable from both vault and fallback while the running Development API had successfully validated Notion. Loading the API's normal configuration before resolving startup secrets made the same read succeed without changing any secret.

**How to apply:** Reuse the normal startup configuration path for maintenance work. Never inspect, print, copy, or export credential values to compensate, and do not ask the owner to reconnect a working integration based only on an uninitialized shell command.

Do not use workspace `REPLIT_ENVIRONMENT` metadata alone to identify a database
target for a Development-only maintenance operation.

**Why:** This workspace reported production environment metadata while its
database connection matched the explicitly selected Development database.
The metadata flag was not reliable evidence of which database would be changed.

**How to apply:** Obtain an independent, nonsecret fingerprint through an
explicit Development read-only query and require the maintenance connection to
match it before mutation. Keep deployment-process refusal and explicit user
confirmation; never print connection strings or override a deployment guard.
