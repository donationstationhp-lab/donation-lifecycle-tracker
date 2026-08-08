import { Router, type IRouter } from "express";
import healthRouter from "./health";
import itemsRouter from "./items";
import dashboardRouter from "./dashboard";
import deliveryRoutesRouter from "./deliveryRoutes";

const router: IRouter = Router();

router.use(healthRouter);
router.use(itemsRouter);
router.use(dashboardRouter);
router.use(deliveryRoutesRouter);

export default router;
