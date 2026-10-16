import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { db, donationSubmissionsTable } from "@workspace/db";
import { ReceiveDonationOfferBody, ReviewDonationOfferBody } from "@workspace/api-zod";
import { requireStaff } from "../middlewares/apiKeyAuth";
import {
  DonationOfferError, receiveDonationOffer, reviewDonationOffer, validOfferDate,
} from "../lib/donationOffers";
import { ItemIdCapacityError } from "../lib/itemIds";
import { NetworkError } from "../lib/networkRules";

const router: IRouter = Router();
router.use(requireStaff);

router.get("/donation-offers", async (_req, res) => {
  res.json(await db.select().from(donationSubmissionsTable)
    .orderBy(desc(donationSubmissionsTable.createdAt)));
});

router.post("/donation-offers/:id/review", async (req, res): Promise<void> => {
  if (res.locals.authMethod !== "clerk" || !res.locals.staffUserId) {
    res.status(403).json({ error: "Sign in with an assigned staff account to review offers." });
    return;
  }
  const parsed = ReviewDonationOfferBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose approve or decline." }); return;
  }
  try {
    res.json(await reviewDonationOffer(String(req.params.id), parsed.data.decision, res.locals.staffUserId));
  } catch (error) {
    if (error instanceof DonationOfferError) {
      res.status(error.status).json({ error: error.message }); return;
    }
    throw error;
  }
});

router.post("/donation-offers/:id/receive", async (req, res): Promise<void> => {
  if (res.locals.authMethod !== "clerk" || !res.locals.staffUserId) {
    res.status(403).json({ error: "Sign in with an assigned staff account to confirm physical receipt." });
    return;
  }
  const parsed = ReceiveDonationOfferBody.safeParse(req.body);
  if (!parsed.success || parsed.data.detailsVerified !== true
    || !parsed.data.receivedDetails.name.trim()
    || !validOfferDate(parsed.data.receivedDetails.expiryDate)) {
    res.status(400).json({ error: "Verify valid received details and explicitly confirm physical receipt." });
    return;
  }
  try {
    res.json(await receiveDonationOffer(String(req.params.id), parsed.data.receivedDetails, res.locals.staffUserId, parsed.data.receivingAgentId));
  } catch (error) {
    if (error instanceof DonationOfferError || error instanceof NetworkError) {
      res.status(error.status).json({ error: error.message }); return;
    }
    if (error instanceof ItemIdCapacityError) {
      res.status(503).json({ error: error.message }); return;
    }
    throw error;
  }
});

export default router;
