import { Router, type IRouter } from "express";
import { apiKeyAuth } from "../middlewares/apiKeyAuth";
import healthRouter from "./health";
import itemsRouter from "./items";
import dashboardRouter from "./dashboard";
import deliveryRoutesRouter from "./deliveryRoutes";
import locationsRouter from "./locations";
import cliExtrasRouter from "./cliExtras";

const router: IRouter = Router();

// ── Unauthenticated endpoints ────────────────────────────────────────────────
// /healthz and /health are registered BEFORE the auth middleware so they are
// always reachable without an X-API-Key header.
router.use(healthRouter);

// ── Auth gate ────────────────────────────────────────────────────────────────
// Every route registered after this line requires a valid X-API-Key header.
router.use(apiKeyAuth);

// ── Protected endpoints ──────────────────────────────────────────────────────
router.use(itemsRouter);
router.use(dashboardRouter);
router.use(deliveryRoutesRouter);
router.use(locationsRouter);
router.use(cliExtrasRouter);

export default router;
