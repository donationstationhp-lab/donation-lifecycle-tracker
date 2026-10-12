---
name: ATTEND workbook identities
description: Meaning of the companion tracker's ATTEND entry identifier when relating or consolidating trackers.
---

The user-provided companion tracker report defines `attend_entry_id` as the numeric ATTEND entry identifier referenced by the companion workbook's “Linked ATTEND Entry ID” field. It is distinct from the internal item UUID, the human-readable item ID, and a claim tracking number.

**Why:** The companion tracker and this tracker have related source history but different identifier schemes; treating these identifiers as interchangeable could link a workbook entry to the wrong item or claim.

**How to apply:** Preserve the workbook identifier as its own external reference when comparing or consolidating trackers. Verify the source data and workbook relationship before mapping records; do not infer that an ATTEND entry number is a DS item number or a claim code.
