---
name: Vault service-token registration
description: How Secret Key Api production authentication relates environment tokens, database hashes, and per-key authorization.
---

Secret Key Api service routes do not authenticate directly against the environment variable. Deployment synchronization must hash the configured service token into the production token registry and grant that token access to every secret name its client needs.

**Why:** Matching environment secrets still produced 401 responses until the token hash was registered in production, and then produced 403 responses until the second required key was added to the token's authorization set.

**How to apply:** When rotating the vault token, update both projects, publish Secret Key Api so its production sync completes, verify each required key independently, and only then restart Donation Station and confirm source-only startup logs report `vault`.

Check that the configured vault address is live before diagnosing token registration or grants. Do not infer the vault project's editor name from its service hostname.

**Why:** A generic missing-startup-secret error can also result from an unavailable vault deployment. A public Replit app-not-live page and a 404 on the configured API path do not establish a token-permission problem.

**How to apply:** Verify public endpoint availability without credentials or response secret bodies, identify the actual vault project and its verified published URL, then investigate authentication. Do not change the client's URL merely because another project has a similar name.

The user verified that the separate Secret Access project at `https://secret-access.replit.app` is another Donation Station site, not the secrets vault.

**Why:** Its misleading name led to directing the user to the wrong project; the user checked that it has no service-secrets endpoints.

**How to apply:** Do not use Secret Access as the vault or direct the user there for vault administration. Locate and verify the actual vault separately.

The user approved using Donation Station's existing direct-secret fallback to recover publishing rather than waiting to locate the unavailable vault.

**Why:** Notion startup was blocked, and the supported fallback avoids application-code changes or changes to existing records.

**How to apply:** Configure the existing Notion integration credential securely for the published app and verify production availability before retrying publishing. This recovery decision does not authorize decommissioning the vault, rotating unrelated credentials, or switching Notion workspaces.

Secret-presence metadata can disagree with the Publishing UI for deployment-only secrets, even when requesting the production environment.

**Why:** The helper reported an editor-only secret present and a newly added deployment-only secret absent while the Publishing UI showed the opposite. Presence metadata alone was therefore insufficient to establish the deployment's actual configuration.

**How to apply:** Acknowledge discrepancies rather than asking the user to enter a visible deployment secret again. Confirm production configuration in Publishing and actual resolution in the next deployment's startup logs; never inspect values to resolve the discrepancy.