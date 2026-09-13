import { Router, type IRouter } from "express";
import { getNotionEnv } from "../lib/notion";
import { getNotionItemLogSchema } from "../lib/notionItemLogSchema";

const router: IRouter = Router();

router.get("/notion/health", async (_req, res) => {
  try {
    const env = getNotionEnv();
    const itemLogSchema = getNotionItemLogSchema();
    res.json({
      ok: true,
      hasApiKey: !!env.apiKey,
      itemsDataSourceUrl: env.itemsDataSourceUrl,
      routesDataSourceUrl: env.routesDataSourceUrl,
      itemLogDataSourceId: itemLogSchema.dataSourceId,
      itemLogPropertyCount: Object.keys(itemLogSchema.properties).length,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});

export default router;
