/**
 * Stripe webhook handling — pure parts (no network, no DB) so they can be
 * unit-tested without credentials.
 *
 * Signature check follows Stripe's documented scheme: the `Stripe-Signature`
 * header carries `t=<unix seconds>` and one or more `v1=<hex HMAC-SHA256>`;
 * the signed payload is `${t}.${rawBody}` keyed with the endpoint secret.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const SIGNATURE_TOLERANCE_SECONDS = 300;

export function verifyStripeSignature(
  rawBody: string,
  header: string | undefined,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!header) return false;

  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key === "t") timestamp = Number(value);
    else if (key === "v1" && value) signatures.push(value);
  }
  if (timestamp === null || !Number.isFinite(timestamp) || signatures.length === 0) return false;
  if (Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest();
  return signatures.some((sig) => {
    const given = Buffer.from(sig, "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

// Stage names as they appear in the Notion "Donors & Contributions" Stage select.
export type NotionStage = "Prospect" | "First gift" | "Active" | "Lapsing" | "Lapsed" | "Reactivated";

export type DonorStageEvent = "customer" | "one-time-gift" | "recurring-gift" | "subscription" | "payment-failed";

/**
 * Next Notion stage for a donor after a Stripe event. `current` is null for a
 * donor that doesn't exist yet. Mirrors the tracker's GIVE stages: a gift after
 * a lapse is a reactivation, a failed payment marks the donor lapsing.
 */
export function nextStage(current: NotionStage | null, event: DonorStageEvent): NotionStage {
  switch (event) {
    case "customer":
      return current ?? "Prospect";
    case "payment-failed":
      return "Lapsing";
    case "subscription":
      return current === "Lapsing" || current === "Lapsed" ? "Reactivated" : "Active";
    case "one-time-gift":
    case "recurring-gift": {
      if (current === "Lapsing" || current === "Lapsed") return "Reactivated";
      if (event === "recurring-gift") return current === "Reactivated" ? current : "Active";
      if (current === null || current === "Prospect") return "First gift";
      return current;
    }
  }
}

export type DonorRef = {
  email: string | null;
  customerId: string | null;
  name: string | null;
};

export type StripeAction =
  | { kind: "record-charge"; status: "Received" | "Failed"; chargeId: string; amount: number; date: string; recurring: boolean; donor: DonorRef }
  | { kind: "refund-charge"; chargeId: string }
  | { kind: "upsert-donor"; donor: DonorRef; event: "customer" | "subscription" }
  | { kind: "ignore"; reason: string };

type StripeEvent = { type: string; data: { object: Record<string, any> } };

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Turns a Stripe event into the one thing the tracker should do about it. */
export function planStripeEvent(event: StripeEvent): StripeAction {
  const obj = event.data?.object ?? {};

  switch (event.type) {
    case "charge.succeeded":
    case "charge.failed": {
      const chargeId = str(obj.id);
      if (!chargeId) return { kind: "ignore", reason: "charge without id" };
      return {
        kind: "record-charge",
        status: event.type === "charge.succeeded" ? "Received" : "Failed",
        chargeId,
        // Stripe amounts are in the currency's smallest unit; Notion's Amount is dollars.
        amount: Number(obj.amount ?? 0) / 100,
        date: new Date(Number(obj.created ?? 0) * 1000).toISOString(),
        recurring: str(obj.invoice) !== null,
        donor: {
          email: str(obj.billing_details?.email) ?? str(obj.receipt_email),
          customerId: str(obj.customer),
          name: str(obj.billing_details?.name),
        },
      };
    }
    case "charge.refunded": {
      const chargeId = str(obj.id);
      return chargeId ? { kind: "refund-charge", chargeId } : { kind: "ignore", reason: "charge without id" };
    }
    case "customer.created":
      return {
        kind: "upsert-donor",
        event: "customer",
        donor: { email: str(obj.email), customerId: str(obj.id), name: str(obj.name) },
      };
    case "customer.subscription.created":
      return {
        kind: "upsert-donor",
        event: "subscription",
        donor: { email: null, customerId: str(obj.customer), name: null },
      };
    default:
      return { kind: "ignore", reason: `unhandled event type ${event.type}` };
  }
}
