---
name: Public tracking verification rollout
description: Constraint governing when Donation Station may activate SMS verification for public claim tracking.
---

Keep public claim tracking SMS and OTP verification disabled until Twilio Trust
Hub approval is explicitly confirmed. Until then, public tracking may show only
PII-safe claim status, curated item labels, and approximate timestamps.

**Why:** The user explicitly paused Twilio work pending Trust Hub approval, and
exact timestamps are intended to remain locked until verified access exists.

**How to apply:** Do not request Twilio credentials, activate SMS endpoints, or
enable verification controls unless the user confirms approval. Preserve the
public API's no-PII and approximate-time boundary meanwhile.