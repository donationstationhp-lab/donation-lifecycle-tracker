# Controlled staging SMS delivery verification

This test uses the same SMS helper as public tracking verification, but sends
one labelled staging SMS without creating a claim or enabling public OTP.
It verifies provider/carrier delivery, not the recipient's reading of the SMS
or completion of the public claim OTP flow.

## Required setup

- Attach the **staging** Twilio integration, not a production messaging account.
- Explicitly select a dedicated staging Twilio account or subaccount.
- Use an SMS-capable sender owned by that account and an approved, consenting
  test recipient. Trial Twilio accounts require verified recipients.
- Complete provider/carrier registration where required. This test does not
  bypass Twilio registration or Trust Hub requirements.
- Configure these development-only values through the workspace environment
  and secrets tools; do not paste credentials or phone numbers into chat/logs:
  - `SMS_STAGING_ENVIRONMENT=staging`
  - `SMS_STAGING_ACCOUNT_SID`
  - `SMS_STAGING_FROM_NUMBER`
  - `SMS_STAGING_PHONE_NUMBER`
- Both numbers must use E.164: a plus sign, country code, and digits, without
  spaces, brackets, or dashes. Sender and recipient must be different.

The script refuses production runtimes and never auto-selects the first account
or sender. Do not set `PUBLIC_TRACKING_OTP_ENABLED` to run this check.

## Run

Preflight without permission to send (safe; records BLOCKED):

```sh
pnpm --filter @workspace/api-server exec tsx src/scripts/verifyStagingSms.ts
```

Only after confirming the configured account and recipient are staging:

```sh
pnpm --filter @workspace/api-server exec tsx src/scripts/verifyStagingSms.ts --confirm-real-send
```

The latter is authorized to send one real SMS and may incur a provider charge.
It uses live SMS credentials, not Twilio's non-delivering test credentials.
Polling lasts up to three minutes; only status lookups are repeated, never sends.

## Evidence and outcome

Reports are saved at `verification-results/staging-sms-latest.json` and appended
to `verification-results/staging-sms-history.jsonl`. They include UTC timestamps,
the message SID, observed statuses, and safe error codes, but no recipient/sender
number, credentials, OTP code, or raw provider response.

- **PASS:** provider reported `delivered`.
- **FAIL:** known rejection, invalid provider configuration, or terminal
  `failed`, `undelivered`, or `canceled` status.
- **BLOCKED:** missing staging settings, malformed numbers, production runtime,
  or missing explicit send approval. No SMS attempted.
- **INCONCLUSIVE:** delivery not confirmed, communications lost during send,
  or mismatched receipt. Inspect provider history before sending another SMS.

HTTP 401/403 indicates credential/permission trouble. Twilio 21211/21614 indicates
recipient format or SMS-capability trouble, 21606 sender trouble, 21608 an
unverified trial recipient, 21610 opt-out, 30007 filtering, and 30034 missing A2P
registration. Resolve the specific issue before rerunning.