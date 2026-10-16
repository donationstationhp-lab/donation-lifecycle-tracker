import { Router, type IRouter } from "express";
import { SaveNetworkBody } from "@workspace/api-zod";
import { requireStaff } from "../middlewares/apiKeyAuth";
import { networkSnapshot, saveNetworkCommand } from "../lib/network";
import { NetworkError } from "../lib/networkRules";

const router: IRouter = Router();
router.use(requireStaff);
router.get("/network", async (_req, res) => { res.json(await networkSnapshot()); });
router.post("/network", async (req, res): Promise<void> => {
  if (res.locals.authMethod !== "clerk" || !res.locals.staffUserId) {
    res.status(403).json({ error: "Sign in with an assigned staff account to record network activity." }); return;
  }
  const input = SaveNetworkBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Check the network form fields." }); return; }
  try { res.json(await saveNetworkCommand(input.data, res.locals.staffUserId)); }
  catch (error) {
    if (error instanceof NetworkError) { res.status(error.status).json({ error: error.message }); return; }
    throw error;
  }
});
export default router;
