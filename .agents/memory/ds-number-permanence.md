---
name: DS number permanence
description: Why committed item numbers must not be reclaimed, including during test cleanup.
---

Treat committed DS item numbers as permanent, even after their local item records are removed. Never lower the shared allocation counter to reclaim gaps or clean up tests.

The owner explicitly retired the old brief to seed the DS counter from 5.
The established audit high-water baseline is 6396; never reset it to 5, 6,
or any lower value. A later, higher counter must likewise remain preserved.

**Why:** The owner confirmed that historical numbering must survive future
baseline reconciliation; the old five-pilot seed brief is obsolete, not a
migration instruction.

**Why:** A number can still identify an item in Notion, a physical label, or another external record after the local record is deleted. Tests that commit high-number fixtures can consume the shared namespace permanently even when the fixture records are later removed.

**How to apply:** Run item-allocation and import race tests in an isolated database schema. Keep production identities and counters untouched during verification. Future identity importers must participate in the same database serialization as intake rather than mint numbers independently.

## Public submission versus physical receipt

The owner explicitly approved a separate reference for new public submissions.
Assign a permanent DS number only when staff confirms physical receipt, not
merely when staff approves an offer. Existing DS and DS-L identifiers remain
unchanged, including those already assigned to historical submissions.

The owner subsequently confirmed the donor-facing format `SUB-<UUID>` and
required approval before physical receipt. Original offers and staff-corrected
received facts must remain separate; approval alone never creates inventory.

**Why:** An offer or an approved plan does not establish that physical goods
have entered custody. The owner confirmed this boundary when resolving the
baseline audit's design conflicts.

**How to apply:** Preserve the distinction between offers and goods received in
future workflow changes. Do not reinterpret a legacy approval button as proof
of receipt, retroactively reclassify historical inventory, or mint replacement
DS/DS-L identities. A submission reference never proves record ownership.

## Verification scope

Treat the promise not to consume shared identifiers as applying to claim
tracking numbers as well as item DS numbers when choosing tests.

**Why:** A broad compatibility run reserved shared development claim numbers
even after synthetic records were removed. Fixture cleanup alone did not mean
the test had no lasting database effect.

**How to apply:** Before a broad regression run, verify that every allocating
test uses an isolated schema/counter or a completely rolled-back transaction.
Prefer targeted isolated checks until that is true. Never reset a shared
counter to hide a test side effect or reclaim the reserved numbers.
