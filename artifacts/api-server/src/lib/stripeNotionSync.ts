/**
 * Writes Stripe events into Notion: the "Stripe Donations" database and the
 * "Donors & Contributions" database (Stage, Email, Stripe Customer ID,
 * Last Donation Date). Replaces the multi-step Zaps, which Zapier's free
 * plan doesn't allow.
 *
 * Every write is idempotent so Stripe retries (and any leftover Zaps) don't
 * create duplicates: donations are matched by Stripe Charge ID, donors by
 * Stripe Customer ID, then Email.
 */
import { nextStage, type DonorRef, type DonorStageEvent, type NotionStage, type StripeAction } from "./stripeWebhook";

const NOTION_API = "https://api.notion.com/v1";
// Data-source endpoints need this API version or later.
const NOTION_VERSION = "2025-09-03";

type StripeNotionEnv = {
  apiKey: string;
  donationsDataSourceId: string;
  donorsDataSourceId: string;
};

/** Accepts a bare id or a `collection://<id>` URL, as Notion shows either. */
function dataSourceId(value: string): string {
  return value.replace(/^collection:\/\//, "").trim();
}

export function getStripeNotionEnv(): StripeNotionEnv {
  const apiKey = process.env["NOTION_API_KEY"];
  const donations = process.env["NOTION_STRIPE_DONATIONS_DATA_SOURCE_ID"];
  const donors = process.env["NOTION_DONORS_DATA_SOURCE_ID"];

  const missing: string[] = [];
  if (!apiKey) missing.push("NOTION_API_KEY");
  if (!donations) missing.push("NOTION_STRIPE_DONATIONS_DATA_SOURCE_ID");
  if (!donors) missing.push("NOTION_DONORS_DATA_SOURCE_ID");
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }

  return {
    apiKey: apiKey!,
    donationsDataSourceId: dataSourceId(donations!),
    donorsDataSourceId: dataSourceId(donors!),
  };
}

type NotionPage = { id: string; properties: Record<string, any> };

async function notion(env: StripeNotionEnv, method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${NOTION_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.apiKey}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Notion ${method} ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function findOne(env: StripeNotionEnv, dataSource: string, filter: unknown): Promise<NotionPage | null> {
  const result = await notion(env, "POST", `/data_sources/${dataSource}/query`, { filter, page_size: 1 });
  return result.results?.[0] ?? null;
}

const text = (value: string) => ({ rich_text: [{ text: { content: value } }] });

function readStage(page: NotionPage): NotionStage | null {
  return (page.properties?.["Stage"]?.select?.name as NotionStage | undefined) ?? null;
}

function readText(page: NotionPage, property: string): string {
  return (page.properties?.[property]?.rich_text ?? []).map((t: any) => t.plain_text ?? "").join("");
}

async function findDonor(env: StripeNotionEnv, donor: DonorRef): Promise<NotionPage | null> {
  if (donor.customerId) {
    const byCustomer = await findOne(env, env.donorsDataSourceId, {
      property: "Stripe Customer ID",
      rich_text: { equals: donor.customerId },
    });
    if (byCustomer) return byCustomer;
  }
  if (donor.email) {
    return findOne(env, env.donorsDataSourceId, { property: "Email", email: { equals: donor.email } });
  }
  return null;
}

/**
 * Finds or creates the donor and moves their Stage. Returns the donor page id,
 * or null when there's nothing to match on (no email and no known customer).
 */
async function upsertDonor(
  env: StripeNotionEnv,
  donor: DonorRef,
  event: DonorStageEvent,
  lastDonationDate?: string,
): Promise<string | null> {
  const existing = await findDonor(env, donor);

  if (existing) {
    const properties: Record<string, unknown> = {
      Stage: { select: { name: nextStage(readStage(existing), event) } },
    };
    if (donor.customerId && !readText(existing, "Stripe Customer ID")) {
      properties["Stripe Customer ID"] = text(donor.customerId);
    }
    if (donor.email && !existing.properties?.["Email"]?.email) {
      properties["Email"] = { email: donor.email };
    }
    if (lastDonationDate) properties["Last Donation Date"] = { date: { start: lastDonationDate } };
    await notion(env, "PATCH", `/pages/${existing.id}`, { properties });
    return existing.id;
  }

  // A new donor needs an email to be worth creating; a bare subscription
  // event is picked up when its first charge arrives.
  if (!donor.email) return null;

  const properties: Record<string, unknown> = {
    "Donor Name": { title: [{ text: { content: donor.name ?? donor.email } }] },
    Email: { email: donor.email },
    Stage: { select: { name: nextStage(null, event) } },
    "Donor Type": { select: { name: "Individual Donor" } },
    "Donation Method": { select: { name: "Financial - Stripe" } },
  };
  if (donor.customerId) properties["Stripe Customer ID"] = text(donor.customerId);
  if (lastDonationDate) properties["Last Donation Date"] = { date: { start: lastDonationDate } };

  const created = await notion(env, "POST", "/pages", {
    parent: { type: "data_source_id", data_source_id: env.donorsDataSourceId },
    properties,
  });
  return created.id;
}

function findDonation(env: StripeNotionEnv, chargeId: string): Promise<NotionPage | null> {
  return findOne(env, env.donationsDataSourceId, {
    property: "Stripe Charge ID",
    rich_text: { equals: chargeId },
  });
}

export type SyncResult = { action: StripeAction["kind"]; detail: string };

export async function applyStripeAction(action: StripeAction, env = getStripeNotionEnv()): Promise<SyncResult> {
  switch (action.kind) {
    case "ignore":
      return { action: action.kind, detail: action.reason };

    case "upsert-donor": {
      const donorId = await upsertDonor(env, action.donor, action.event);
      return { action: action.kind, detail: donorId ? `donor ${donorId}` : "no donor to match yet" };
    }

    case "refund-charge": {
      const donation = await findDonation(env, action.chargeId);
      if (!donation) return { action: action.kind, detail: `no donation for ${action.chargeId}` };
      await notion(env, "PATCH", `/pages/${donation.id}`, {
        properties: { Status: { select: { name: "Refunded" } } },
      });
      return { action: action.kind, detail: `refunded ${donation.id}` };
    }

    case "record-charge": {
      // Stripe retries deliveries; a charge already recorded is done.
      if (await findDonation(env, action.chargeId)) {
        return { action: action.kind, detail: `already recorded ${action.chargeId}` };
      }

      const received = action.status === "Received";
      const event: DonorStageEvent = !received ? "payment-failed" : action.recurring ? "recurring-gift" : "one-time-gift";
      const donorId = await upsertDonor(env, action.donor, event, received ? action.date : undefined);

      const label = `$${action.amount.toFixed(2)} ${received ? "gift" : "failed payment"}`;
      const properties: Record<string, unknown> = {
        Donation: { title: [{ text: { content: `${label} — ${action.donor.name ?? action.donor.email ?? "unknown donor"}` } }] },
        Amount: { number: action.amount },
        Date: { date: { start: action.date } },
        Status: { select: { name: action.status } },
        Recurring: { checkbox: action.recurring },
        "Stripe Charge ID": text(action.chargeId),
      };
      if (action.donor.email) properties["Donor Email"] = { email: action.donor.email };
      if (donorId) properties["Donor"] = { relation: [{ id: donorId }] };

      const created = await notion(env, "POST", "/pages", {
        parent: { type: "data_source_id", data_source_id: env.donationsDataSourceId },
        properties,
      });
      return { action: action.kind, detail: `donation ${created.id}` };
    }
  }
}
