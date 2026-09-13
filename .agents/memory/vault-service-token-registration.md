---
name: Vault service-token registration
description: How Secret Key Api production authentication relates environment tokens, database hashes, and per-key authorization.
---

Secret Key Api service routes do not authenticate directly against the environment variable. Deployment synchronization must hash the configured service token into the production token registry and grant that token access to every secret name its client needs.

**Why:** Matching environment secrets still produced 401 responses until the token hash was registered in production, and then produced 403 responses until the second required key was added to the token's authorization set.

**How to apply:** When rotating the vault token, update both projects, publish Secret Key Api so its production sync completes, verify each required key independently, and only then restart Donation Station and confirm source-only startup logs report `vault`.