# Stripe → Notion webhook

`POST /api/webhooks/stripe` records Stripe payments in Notion without Zapier.
It replaces the multi-step Stripe → Notion Zaps, which Zapier's free plan
doesn't allow.

| Stripe event | What happens in Notion |
| --- | --- |
| `charge.succeeded` | Adds a **Stripe Donations** row (Received), and finds or creates the donor and links them. Sets Stage to First gift (one-time), Active (recurring), or Reactivated (after Lapsing/Lapsed), plus Last Donation Date |
| `charge.failed` | Adds a Failed row and sets the donor's Stage to Lapsing |
| `charge.refunded` | Sets the row's Status to Refunded |
| `customer.created` | Finds the donor by email, or creates them as Prospect, and fills in Stripe Customer ID |
| `customer.subscription.created` | Sets a known donor's Stage to Active, or Reactivated if they were lapsing |

Donors are matched by Stripe Customer ID first, then by Email. Donations are
matched by Stripe Charge ID. That makes Stripe's retries safe, and it also stops
duplicates if a Zap writes the same charge. Even so, turn off any Zap that
writes donations or donors once this endpoint is live.

## Setup

1. In Notion, share **Stripe Donations** and **Donors & Contributions** with the
   integration whose key is `NOTION_API_KEY` (••• → Connections).
2. In Stripe (test mode first), go to Developers → Webhooks → Add endpoint:
   `https://<your app>/api/webhooks/stripe`, and select the five events above.
3. Set these environment variables (Replit Secrets):

| Variable | Value |
| --- | --- |
| `STRIPE_WEBHOOK_SECRET` | The endpoint's signing secret (`whsec_…`) |
| `NOTION_API_KEY` | Already used by `/notion/health` |
| `NOTION_STRIPE_DONATIONS_DATA_SOURCE_ID` | `51557e29-4696-485b-ba83-0e36106b24be` |
| `NOTION_DONORS_DATA_SOURCE_ID` | `5a74f4de-8488-46a9-af9f-89b2bba33549` |

4. Send a test event with Stripe's **Send test webhook** button, or make a test-mode
   payment, and check that a row appears in Stripe Donations.

Requests without a valid `Stripe-Signature` get a 400 response. When a Notion write
fails, the endpoint returns 500, and Stripe retries.
