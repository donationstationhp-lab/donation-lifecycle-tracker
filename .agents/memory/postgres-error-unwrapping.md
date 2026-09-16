---
name: PostgreSQL error unwrapping
description: How to classify expected PostgreSQL conflicts raised through Drizzle.
---

When an API maps a known PostgreSQL error such as a uniqueness conflict to a
domain response, inspect the error and its nested causes for the PostgreSQL
error code rather than checking only the outer exception.

**Why:** Drizzle can wrap the driver error in a query error. Checking only the
outer object turns an expected conflict into a generic server error precisely
on concurrent paths.

**How to apply:** Use a bounded or terminating cause-chain walk when classifying
database errors. Keep unknown codes exceptional so genuine database failures
are not mistaken for expected conflicts.