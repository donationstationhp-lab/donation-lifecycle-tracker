---
name: Public tracking verification rollout
description: Constraint governing when Donation Station may activate SMS verification for public claim tracking.
---

Keep public claim tracking PII-safe by default. SMS and OTP verification may be
active only after Twilio Trust Hub approval and an attached Twilio connection;
unverified visitors must still see only curated status and approximate times.

**Why:** Exact timestamps are sensitive and should be disclosed only after a
successful, single-use recipient verification.

**How to apply:** Keep verification codes hashed, expiring, and attempt-limited;
enforce resend cooldowns server-side; never include the phone number in public
responses; and return exact times only from a successful verification response.

Controlled delivery tests must select a dedicated staging Twilio account and a
consenting test recipient explicitly, without enabling the public OTP gate.
Provider acceptance (`queued` or `sent`) is not a delivery pass; require
`delivered`, and report missing configuration or unconfirmed delivery honestly.

**Why:** The user requires real SMS verification in staging only, with delivery
confirmation and a recorded pass/fail result. A live message can be billable and
an interrupted send can have an unknown outcome.

**How to apply:** Never auto-select a production account/sender or resend after
an ambiguous send. Keep phone numbers, OTP codes, and credentials out of reports.