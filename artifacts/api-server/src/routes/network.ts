import { Router, type IRouter } from "express";
import { InitializeNetworkSitesBody, SaveNetworkBody } from "@workspace/api-zod";
import { requireStaff, requireSupervisor } from "../middlewares/apiKeyAuth";
import { networkSnapshot, saveNetworkCommand } from "../lib/network";
import { NetworkError } from "../lib/networkRules";
import { initializeStandardAgents } from "../lib/networkInitialization";
import { logger } from "../lib/logger";

const router: IRouter = Router();
router.use(requireStaff);
router.post("/network/initialize-sites", requireSupervisor, async (req, res): Promise<void> => {
  if (res.locals.authMethod !== "clerk" || !res.locals.staffUserId) {
    res.status(403).json({ error: "Sign in with an assigned supervisor account to initialize sites." }); return;
  }
  if (!InitializeNetworkSitesBody.safeParse(req.body).success) {
    res.status(400).json({ error: "Explicitly confirm initialization of the three standard sites." }); return;
  }
  try {
    const result = await initializeStandardAgents();
    logger.info(result, "Supervisor initialized standard network sites");
    res.json(result);
  } catch (error) {
    if (error instanceof NetworkError) { res.status(error.status).json({ error: error.message }); return; }
    throw error;
  }
});
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
