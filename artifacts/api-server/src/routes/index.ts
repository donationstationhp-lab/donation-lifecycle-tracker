import { Router, type IRouter } from "express";
import { apiKeyAuth } from "../middlewares/apiKeyAuth";
import healthRouter from "./health";
import publicRoutes from "./publicRoutes";
import itemsRouter from "./items";
import dashboardRouter from "./dashboard";
import deliveryRoutesRouter from "./deliveryRoutes";
import locationsRouter from "./locations";
import cliExtrasRouter from "./cliExtras";
import notionHealthRouter from "./notionHealth";
import notionHealthRouter from "./notionHealth";
const router: IRouter = Router();

// ── Unauthenticated endpoints ────────────────────────────────────────────────
// These are registered BEFORE the auth middleware.
router.use(healthRouter);   // /healthz  /health
router.use(publicRoutes);   // /public/donate
router.use(notionHealthRouter); // /notion/health
router.use(notionHealthRouter);
// ── Auth gate ────────────────────────────────────────────────────────────────
router.use(apiKeyAuth);

// ── Protected endpoints ──────────────────────────────────────────────────────
router.use(itemsRouter);
router.use(dashboardRouter);
router.use(deliveryRoutesRouter);
router.use(locationsRouter);
router.use(cliExtrasRouter);

export default router;