import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

// Unauthenticated health check used by web app clients
router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// CLI-facing unauthenticated endpoint — no auth middleware applied here
router.get("/health", (_req, res) => {
  res.json({ status: "ok", version: "1.0" });
});

export default router;
