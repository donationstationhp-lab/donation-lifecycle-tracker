import type { IncomingHttpHeaders, ServerResponse } from "node:http";
import type { RequestHandler } from "express";
import { createProxyServer } from "httpxy";

const CLERK_FAPI = "https://frontend-api.clerk.dev";
export const CLERK_PROXY_PATH = "/api/__clerk";

export function getClerkProxyHost(req: {
  headers: IncomingHttpHeaders;
}): string | undefined {
  const forwarded = req.headers["x-forwarded-host"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return raw?.split(",")[0]?.trim() || req.headers.host?.trim() || undefined;
}

export function clerkProxyMiddleware(): RequestHandler {
  if (process.env.NODE_ENV !== "production" || !process.env.CLERK_SECRET_KEY) {
    return (_req, _res, next) => next();
  }

  return createClerkProxyMiddleware(process.env.CLERK_SECRET_KEY);
}

// Use the same transport as http-proxy-middleware without its unused glob parser.
// Production always uses the fixed Clerk target; target injection is for local tests.
export function createClerkProxyMiddleware(
  secretKey: string,
  target = CLERK_FAPI,
): RequestHandler {
  const proxy = createProxyServer({
    target,
    changeOrigin: true,
    selfHandleResponse: true,
  });

  function failProxy(error: unknown, res: ServerResponse): void {
    if (res.destroyed || res.writableEnded) return;
    if (res.headersSent) {
      res.destroy();
      return;
    }
    const code = (error as NodeJS.ErrnoException)?.code ?? "";
    const status = code.startsWith("HPE_INVALID")
      ? 502
      : ["ECONNRESET", "ENOTFOUND", "ECONNREFUSED", "ETIMEDOUT"].includes(code)
        ? 504
        : 500;
    // Never reflect request headers, credentials, or upstream error details.
    res.writeHead(status, { "content-length": "0" });
    res.end();
  }

  proxy.on("error", (error, _req, res) => {
    if (res && "writeHead" in res) failProxy(error, res);
  });
  proxy.on("proxyReq", (proxyReq, req) => {
    const protocol = req.headers["x-forwarded-proto"] || "https";
    const host = getClerkProxyHost(req) || "";
    proxyReq.setHeader("Clerk-Proxy-Url", `${protocol}://${host}${CLERK_PROXY_PATH}`);
    proxyReq.setHeader("Clerk-Secret-Key", secretKey);
    const xff = req.headers["x-forwarded-for"];
    const clientIp =
      (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      "";
    if (clientIp) proxyReq.setHeader("X-Forwarded-For", clientIp);
  });
  proxy.on("proxyRes", (proxyRes, req, res) => {
    const headers = { ...proxyRes.headers };
    delete headers["transfer-encoding"];
    delete headers.connection;
    delete headers["keep-alive"];
    const status = proxyRes.statusCode ?? 502;
    if (status < 200 || status === 204) delete headers["content-length"];
    const bodyless =
      req.method === "HEAD" || status < 200 || status === 204 || status === 304;
    if (headers["content-length"] !== undefined || bodyless) {
      res.writeHead(status, headers);
      proxyRes.on("error", () => res.destroy());
      proxyRes.pipe(res);
      return;
    }
    const chunks: Buffer[] = [];
    proxyRes.on("data", (chunk: Buffer) => chunks.push(chunk));
    proxyRes.on("end", () => {
      const body = Buffer.concat(chunks);
      headers["content-length"] = String(body.length);
      res.writeHead(status, headers);
      res.end(body);
    });
    proxyRes.on("error", () => {
      if (!res.headersSent) res.writeHead(502, { "content-length": "0" });
      res.end();
    });
  });

  return (req, res) => {
    // Express normally strips the mount prefix. Also support an unstripped URL.
    // Request URLs are data, never patterns; there is no glob/brace compilation.
    req.url = req.url.replace(/^\/api\/__clerk(?=\/|\?|$)/, "") || "/";
    void proxy.web(req, res).catch((error: unknown) => failProxy(error, res));
  };
}