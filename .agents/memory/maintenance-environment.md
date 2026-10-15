---
name: Maintenance process configuration
description: Why a bare maintenance command can report missing Notion credentials while the API works.
---

Do not treat missing credentials in a bare shell maintenance process as proof that the running API's credentials are absent or broken. Maintenance entrypoints must initialize the same configuration and startup-secret resolution as the API.

**Why:** A bare inspection reported Notion unavailable from both vault and fallback while the running Development API had successfully validated Notion. Loading the API's normal configuration before resolving startup secrets made the same read succeed without changing any secret.

**How to apply:** Reuse the normal startup configuration path for maintenance work. Never inspect, print, copy, or export credential values to compensate, and do not ask the owner to reconnect a working integration based only on an uninitialized shell command.
