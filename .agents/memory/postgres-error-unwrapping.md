---
name: PostgreSQL error unwrapping
description: How to classify expected PostgreSQL conflicts raised through Drizzle.
---

When an API maps a known PostgreSQL uniqueness conflict to a domain response,
inspect the error and its nested causes for both SQLSTATE `23505` and the
specific allowlisted constraint name.

**Why:** Drizzle can wrap the driver error in a query error, while mapping every
uniqueness error to the same response can hide a new data-integrity defect.
Constraint-specific matching keeps expected concurrent conflicts user-friendly
without mislabeling unknown failures.

**How to apply:** Use a bounded or terminating cause-chain walk and match only
constraints whose domain conflict is understood by that endpoint. Keep unknown
codes and constraint names exceptional.