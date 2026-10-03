import { Router, type IRouter } from "express";
import { GetConScireWindowsQueryParams, GetConScireWindowsResponse } from "@workspace/api-zod";
import { whenAllStages, whenWindows } from "../lib/conScire";

const router: IRouter = Router();

router.get("/con-scire/windows", (req, res): void => {
  const parsed = GetConScireWindowsQueryParams.strict().safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "stage must be all or a lifecycle stage; days must be an integer from 1 to 90." });
    return;
  }
  const stage = parsed.data.stage ?? "all";
  const days = Number(parsed.data.days ?? "30");
  const startDate = new Date();
  startDate.setUTCHours(0, 0, 0, 0);
  const data = stage === "all"
    ? { days, startDate: startDate.toISOString(), stages: whenAllStages(startDate, days) }
    : { stage, days, startDate: startDate.toISOString(), windows: whenWindows(stage, startDate, days) };
  res.json(GetConScireWindowsResponse.parse(data));
});

export default router;