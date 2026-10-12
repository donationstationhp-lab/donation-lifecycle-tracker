---
name: DS number permanence
description: Why committed item numbers must not be reclaimed, including during test cleanup.
---

Treat committed DS item numbers as permanent, even after their local item records are removed. Never lower the shared allocation counter to reclaim gaps or clean up tests.

**Why:** A number can still identify an item in Notion, a physical label, or another external record after the local record is deleted. Tests that commit high-number fixtures can consume the shared namespace permanently even when the fixture records are later removed.

**How to apply:** Run item-allocation and import race tests in an isolated database schema. Keep production identities and counters untouched during verification. Future identity importers must participate in the same database serialization as intake rather than mint numbers independently.
