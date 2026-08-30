import { Router, type IRouter } from "express";
import { apiKeyAuth } from "../middlewares/apiKeyAuth";
import healthRouter, { protectedHealthRouter } from "./health";
import publicRoutes from "./publicRoutes";
import itemsRouter from "./items";
import dashboardRouter from "./dashboard";
import deliveryRoutesRouter from "./deliveryRoutes";
import locationsRouter from "./locations";
import cliExtrasRouter from "./cliExtras";
import notionHealthRouter from "./notionHealth";
import pickupsRouter from "./pickups";
import attendRouter from "./attend";

const router: IRouter = Router();

// ── Unauthenticated endpoints ────────────────────────────────────────────────
// These are registered BEFORE the auth middleware.
router.use(healthRouter);   // /healthz  /health
router.use(publicRoutes);   // /public/donate
router.use(notionHealthRouter); // /notion/health

// ── Auth gate ────────────────────────────────────────────────────────────────
router.use(apiKeyAuth);

// ── Protected endpoints ──────────────────────────────────────────────────────
router.use(protectedHealthRouter); // /health
router.use(itemsRouter);
router.use(dashboardRouter);
router.use(deliveryRoutesRouter);
router.use(locationsRouter);
router.use(cliExtrasRouter);
router.use(pickupsRouter);
router.use(attendRouter);

export default router;