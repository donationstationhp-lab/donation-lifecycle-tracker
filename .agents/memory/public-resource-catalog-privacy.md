---
name: Public resource catalog privacy
description: Safety boundary for exposing available inventory to unauthenticated visitors.
---

Public resource browsing must aggregate only reviewed, ready-for-matching inventory under curated item, category, and condition labels. Do not expose row identifiers, donor or recipient data, exact locations, notes, or raw free-form labels.

**Why:** Inventory records contain operational identifiers and free-form content that can reveal personal or sensitive information; grouped sanitized availability is useful without creating that exposure.

**How to apply:** Keep public catalog responses allowlist-based and add privacy regression checks whenever catalog fields or item-label mappings change. Catalog browsing is informational and must not bypass staff-mediated claims, matching, or reservations.