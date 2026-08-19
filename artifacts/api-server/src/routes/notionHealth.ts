import { Router, type IRouter } from "express";
import { getNotionEnv } from "../lib/notion";

const router: IRouter = Router();

router.get("/notion/health", async (_req, res) => {
  try {
    const env = getNotionEnv();
    res.json({
      ok: true,
      hasApiKey: !!env.apiKey,
      itemsDataSourceUrl: env.itemsDataSourceUrl,
      routesDataSourceUrl: env.routesDataSourceUrl,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});

export default router;
