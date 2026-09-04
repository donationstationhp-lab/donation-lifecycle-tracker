import { Router, type IRouter } from "express";
import { staffAuth } from "../middlewares/staffAuth";
import healthRouter from "./health";
import publicRoutes from "./publicRoutes";
import authRouter from "./auth";
import itemsRouter from "./items";
import donorsRouter from "./donors";
import dashboardRouter from "./dashboard";
import deliveryRoutesRouter from "./deliveryRoutes";
import locationsRouter from "./locations";
import cliExtrasRouter from "./cliExtras";

const router: IRouter = Router();

// ── Unauthenticated endpoints ────────────────────────────────────────────────
// These are registered BEFORE the auth middleware.
router.use(healthRouter);   // /healthz  /health
router.use(publicRoutes);   // /public/donate
router.use(authRouter);     // /auth/login  /auth/logout  /auth/me (self-checking)

// ── Auth gate ────────────────────────────────────────────────────────────────
// Accepts either a valid X-API-Key (CLI/automation) or a signed-in staff session.
router.use(staffAuth);

// ── Protected endpoints ──────────────────────────────────────────────────────
router.use(itemsRouter);
router.use(donorsRouter);
router.use(dashboardRouter);
router.use(deliveryRoutesRouter);
router.use(locationsRouter);
router.use(cliExtrasRouter);

export default router;
