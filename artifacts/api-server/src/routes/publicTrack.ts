import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import {
  claimHistoryTable,
  claimsTable,
  db,
  donationItemsTable,
} from "@workspace/db";
import { GetPublicTrackingResponse } from "@workspace/api-zod";

const router: IRouter = Router();
const PUBLIC_TIME_ZONE = "America/Chicago";

const titleCase = (value: string) =>
  value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

function normalizedTrackingCode(value: string | string[]): string {
  return (Array.isArray(value) ? value[0] : value).trim().toUpperCase();
}

const publicCategories: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bfood\b/i, label: "Food" },
  { pattern: /\bcloth(?:es|ing)?\b/i, label: "Clothing" },
  { pattern: /\bfurniture\b/i, label: "Furniture" },
  { pattern: /\belectronics?\b/i, label: "Electronics" },
  { pattern: /\b(household|home)\b/i, label: "Household" },
  { pattern: /\b(hygiene|toiletr(?:y|ies)|personal care)\b/i, label: "Hygiene" },
  { pattern: /\b(medical|health)\b/i, label: "Medical supply" },
  { pattern: /\b(school|education)\b/i, label: "School supply" },
];

const publicItemNames: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bfrozen\b.*\bchicken\b|\bchicken\b.*\bfrozen\b/i, label: "Frozen chicken" },
  { pattern: /\bcanned\b.*\bsoup\b|\bsoup\b.*\bcanned\b/i, label: "Canned soup" },
  { pattern: /\bcanned goods?\b/i, label: "Canned goods" },
  { pattern: /\bproduce\b|\bvegetables?\b|\bfruit\b/i, label: "Fresh produce" },
  { pattern: /\brice\b/i, label: "Rice" },
  { pattern: /\bpasta\b/i, label: "Pasta" },
  { pattern: /\bcoat\b|\bjacket\b/i, label: "Coat or jacket" },
  { pattern: /\bshirt\b/i, label: "Shirt" },
  { pattern: /\bpants?\b|\btrousers?\b/i, label: "Pants" },
  { pattern: /\bshoes?\b|\bboots?\b/i, label: "Footwear" },
  { pattern: /\bblankets?\b/i, label: "Blanket" },
  { pattern: /\bsoap\b/i, label: "Soap" },
  { pattern: /\bdiapers?\b/i, label: "Diapers" },
];

export function safeCategory(category: string): string {
  return publicCategories.find(({ pattern }) => pattern.test(category))?.label
    ?? "Donation";
}

export function safeItemName(name: string, category: string): string {
  return publicItemNames.find(({ pattern }) => pattern.test(name))?.label
    ?? `${safeCategory(category)} item`;
}

function approximateTimestamp(value: Date): string {
  const date = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: PUBLIC_TIME_ZONE,
  }).format(value);
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: PUBLIC_TIME_ZONE,
    }).format(value),
  );
  const period =
    hour < 5 ? "overnight" :
    hour < 12 ? "morning" :
    hour < 17 ? "afternoon" :
    hour < 21 ? "evening" :
    "night";

  return `${date} (${period})`;
}

router.get("/public/track/:trackingCode", async (req, res): Promise<void> => {
  const trackingCode = normalizedTrackingCode(req.params.trackingCode);
  if (!/^DSC-\d{6}$/.test(trackingCode)) {
    res.status(404).json({ error: "Tracking record not found" });
    return;
  }

  const [result] = await db
    .select({
      claimId: claimsTable.id,
      trackingCode: claimsTable.trackingCode,
      status: claimsTable.status,
      updatedAt: claimsTable.updatedAt,
      itemName: donationItemsTable.name,
      itemCategory: donationItemsTable.category,
      itemStage: donationItemsTable.stage,
    })
    .from(claimsTable)
    .innerJoin(donationItemsTable, eq(claimsTable.itemId, donationItemsTable.id))
    .where(eq(claimsTable.trackingCode, trackingCode))
    .limit(1);

  if (!result?.trackingCode) {
    res.status(404).json({ error: "Tracking record not found" });
    return;
  }

  const history = await db
    .select({
      status: claimHistoryTable.toStatus,
      timestamp: claimHistoryTable.timestamp,
    })
    .from(claimHistoryTable)
    .where(eq(claimHistoryTable.claimId, result.claimId))
    .orderBy(asc(claimHistoryTable.timestamp));

  res.json(GetPublicTrackingResponse.parse({
    trackingCode: result.trackingCode,
    item: {
      categoryLabel: `${safeCategory(result.itemCategory)} item`,
      name: safeItemName(result.itemName, result.itemCategory),
    },
    stage: titleCase(result.itemStage),
    status: titleCase(result.status),
    lastUpdatedApprox: approximateTimestamp(result.updatedAt),
    lastUpdatedExact: null,
    timeline: history.map((entry) => ({
      label: entry.status === "submitted"
        ? "Claim submitted"
        : titleCase(entry.status),
      approx: approximateTimestamp(entry.timestamp),
      exact: null,
    })),
    exactTimesLocked: true,
  }));
});

export default router;