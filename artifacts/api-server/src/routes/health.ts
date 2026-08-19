import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const publicRouter: IRouter = Router();
const protectedRouter: IRouter = Router();

// Legacy unauthenticated health check used by the deployment health probe.
publicRouter.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// CLI-facing health check. This router is mounted after apiKeyAuth.
protectedRouter.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

export const protectedHealthRouter = protectedRouter;
export default publicRouter;
