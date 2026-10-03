---
name: OpenAPI calendar dates
description: Date-only API values must survive generated Zod validation without becoming timestamps.
---

Preserve date-only calendar values as strings across generated response validation.

**Why:** The workspace's Orval Zod generator coerces OpenAPI `format: date` values to JavaScript Dates. JSON serialization then changes `YYYY-MM-DD` into a full midnight timestamp, changing the wire contract even when the pure calendar calculation is correct.

**How to apply:** For date-only fields, use a string pattern rather than `format: date`, and test the serialized HTTP response against the pure function output. Use full ISO timestamps only for fields whose contract calls for timestamps.