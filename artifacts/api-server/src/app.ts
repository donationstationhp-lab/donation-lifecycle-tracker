import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import router from "./routes";
import { logger } from "./lib/logger";
import { databaseErrorHandler } from "./middlewares/databaseAvailability";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(
  clerkMiddleware((req) => {
    if (process.env.NODE_ENV !== "production") return {};
    const host = getClerkProxyHost(req);
    return host
      ? {
          publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
          proxyUrl: `https://${host}${CLERK_PROXY_PATH}`,
        }
      : {};
  }),
);
app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/healthz", (_req, res) => { res.json({ status: "ok" }); });
app.use("/api", router);
app.use(databaseErrorHandler);

export default app;
