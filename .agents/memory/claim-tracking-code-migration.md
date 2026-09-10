---
name: Claim tracking code migration
description: Historical compatibility rule for rolling strict sequential claim codes into an existing published database.
---

Assign a new `DSC-######` code only when a claim has no tracking code. Preserve
every non-null historical code, including legacy `DS-*` values, and accept those
codes wherever existing public links are resolved.

**Why:** Historical tracking links may already have been shared. Replacing a
non-null legacy value during repair silently breaks those permanent links.

**How to apply:** Backfills may update null codes only. Once any tracking code is
assigned, enforce immutability at the database boundary so it cannot be cleared
or replaced. Initialize the DSC counter after the highest valid DSC code without
rewriting other formats.