---
name: Claim tracking code migration
description: Historical compatibility rule for rolling strict sequential claim codes into an existing published database.
---

When enforcing the `DSC-######` response contract, repair both missing tracking
codes and legacy random `DS-*` values before validating API responses.

**Why:** Production already contained a random claim code from the earlier
implementation. The column and counter table existed, but strict Zod validation
turned the normal claims list into a 500 because the backfill handled only nulls.

**How to apply:** Treat any claim code outside `^DSC-[0-9]{6}$` as needing the
same transactional, locked allocation as a null code. Preserve already-valid
DSC codes and initialize the counter after the highest valid code.