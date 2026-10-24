/**
 * POST /webhooks/stripe — Stripe → Notion sync.
 *
 * Unauthenticated (Stripe can't send our API key); the Stripe signature is
 * the auth. Needs the raw request body, which app.ts provides by mounting
 * express.raw() for this path before express.json().
 *
 * Env: STRIPE_WEBHOOK_SECRET, NOTION_API_KEY,
 *      NOTION_STRIPE_DONATIONS_DATA_SOURCE_ID, NOTION_DONORS_DATA_SOURCE_ID
 */
import { Router, type IRouter } from "express";
import { planStripeEvent, verifyStripeSignature } from "../lib/stripeWebhook";
import { applyStripeAction } from "../lib/stripeNotionSync";

const router: IRouter = Router();

router.post("/webhooks/stripe", async (req, res): Promise<void> => {
  const secret = process.env["STRIPE_WEBHOOK_SECRET"];
  if (!secret) {
    req.log.error("STRIPE_WEBHOOK_SECRET is not set");
    res.status(500).json({ error: "Webhook not configured" });
    return;
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
  if (!verifyStripeSignature(rawBody, req.header("stripe-signature"), secret)) {
    res.status(400).json({ error: "Invalid signature" });
    return;
  }

  let event: { id?: string; type: string; data: { object: Record<string, any> } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    res.status(400).json({ error: "Invalid JSON" });
    return;
  }

  try {
    const result = await applyStripeAction(planStripeEvent(event));
    req.log.info({ stripeEvent: event.id, type: event.type, ...result }, "stripe webhook handled");
    res.json({ received: true, ...result });
  } catch (err: any) {
    // A non-2xx makes Stripe retry later; writes are idempotent, so retries are safe.
    req.log.error({ err, stripeEvent: event.id, type: event.type }, "stripe webhook failed");
    res.status(500).json({ error: "Sync failed" });
  }
});

export default router;
