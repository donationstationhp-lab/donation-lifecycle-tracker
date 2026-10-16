/**
 * Public (unauthenticated) routes — no X-API-Key required.
 * Mounted BEFORE the apiKeyAuth middleware in routes/index.ts.
 */
import { Router, type IRouter } from "express";
import { randomUUID } from "crypto";
import { db, donationSubmissionsTable } from "@workspace/db";
import { SubmitDonationOfferBody } from "@workspace/api-zod";
import { buildPublicResourceCatalog } from "../lib/publicItemLabels";
import { itemRepository } from "../lib/itemRepository";
import { validOfferDate } from "../lib/donationOffers";

const router: IRouter = Router();

router.get("/public/resources", async (_req, res): Promise<void> => {
  const available = await itemRepository.listAvailableResources();

  res.json(buildPublicResourceCatalog(available));
});

/**
 * A public offer is not inventory or evidence of physical receipt.
 * No allocator, identity registry, history, activity or acknowledgment writes.
 */
router.post("/public/donate", async (req, res): Promise<void> => {
  const parsed = SubmitDonationOfferBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.name.trim() || !validOfferDate(parsed.data.expiryDate)) {
    res.status(400).json({ error: "Enter valid donation offer details." });
    return;
  }
  const id = randomUUID();
  const reference = `SUB-${id}`;
  await db.insert(donationSubmissionsTable).values({
    id, reference, offeredDetails: parsed.data,
  });
  res.status(201).json({
    reference,
    message: "Offer submitted—not yet received",
  });
});

router.get("/terms", (_req, res): void => {
  res.type("text/plain").send(`Donation Station HP — Terms of Service

Donation Station HP is a nonprofit. If you opt in to donor SMS notifications, we send a single, non-marketing SMS when your donated item is distributed. Participation is optional and is not required to donate.

Message and data rates may apply. Reply STOP to opt out of SMS notifications at any time.

For questions or assistance, contact info@donationsstations.com.
`);
});

router.get("/privacy", (_req, res): void => {
  res.type("text/plain").send(`Donation Station HP — Privacy Policy

This policy covers our donor SMS notification program. We collect phone numbers only for donor SMS notifications. We never share phone numbers or SMS consent information with third parties for marketing.

SMS service providers may process phone numbers solely to deliver these notifications.

Reply STOP to opt out of SMS notifications. To request deletion of your donor SMS data, including your phone number, email info@donationsstations.com.
`);
});

export default router;
