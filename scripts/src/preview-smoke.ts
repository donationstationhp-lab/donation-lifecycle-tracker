import { URL } from "node:url";

type PreviewDefinition = {
  name: string;
  path: string;
  title: string;
};

const previews: PreviewDefinition[] = [
  {
    name: "Donation Station",
    path: "/",
    title: "Donation Station",
  },
  {
    name: "Canvas",
    path: "/__mockup",
    title: "Mockup Canvas",
  },
];

const requestTimeoutMs = 10_000;

function getPreviewOrigin(): URL {
  const configuredBaseUrl =
    process.env.PREVIEW_BASE_URL?.trim() ||
    process.env.REPLIT_DEV_DOMAIN?.trim();

  if (!configuredBaseUrl) {
    throw new Error(
      "No preview target configured. Run the managed artifact workflows first, or set PREVIEW_BASE_URL to their shared preview origin.",
    );
  }

  const origin = new URL(
    configuredBaseUrl.includes("://")
      ? configuredBaseUrl
      : `https://${configuredBaseUrl}`,
  );

  if (origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error(
      `Preview target must be an origin without a path, query, or hash; received "${configuredBaseUrl}".`,
    );
  }

  return origin;
}

function getPreviewUrl(origin: URL, path: string): URL {
  return new URL(path, origin);
}

function expectedAssetPrefix(path: string): string {
  return path === "/" ? "/" : `${path}/`;
}

async function checkPreview(
  origin: URL,
  preview: PreviewDefinition,
): Promise<void> {
  const url = getPreviewUrl(origin, preview.path);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      redirect: "manual",
      signal: controller.signal,
    });
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "AbortError"
        ? `request timed out after ${requestTimeoutMs}ms`
        : error instanceof Error
          ? error.message
          : String(error);

    throw new Error(
      `${preview.name} preview at ${url} could not be reached: ${reason}. Check that its managed workflow is running and its artifact path is configured.`,
    );
  } finally {
    clearTimeout(timeout);
  }

  if (response.status !== 200) {
    const location = response.headers.get("location");
    const redirectNote = location ? ` (redirected to ${location})` : "";
    throw new Error(
      `${preview.name} preview at ${url} returned HTTP ${response.status}${redirectNote}; expected the app entry document with HTTP 200. Check previewPath and the service paths in its artifact.toml.`,
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("text/html")) {
    throw new Error(
      `${preview.name} preview at ${url} returned content type "${contentType || "missing"}"; expected an HTML app entry document. Check that the managed route points to the web service.`,
    );
  }

  const html = await response.text();
  if (!html.toLowerCase().includes("<!doctype html")) {
    throw new Error(
      `${preview.name} preview at ${url} returned a response that is not an HTML document.`,
    );
  }

  if (!html.includes(`<title>${preview.title}</title>`)) {
    throw new Error(
      `${preview.name} preview at ${url} returned the wrong app entry document; expected the title "${preview.title}". Check artifact routing and preview paths.`,
    );
  }

  if (!html.includes('<div id="root"')) {
    throw new Error(
      `${preview.name} preview at ${url} is missing the React root element; the route may be serving the wrong document.`,
    );
  }

  const assetPrefix = expectedAssetPrefix(preview.path);
  const scriptSources = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(
    (match) => match[1],
  );
  const hasBaseScopedEntryAsset = scriptSources.some(
    (source) =>
      source === `${assetPrefix}src/main.tsx` ||
      source.startsWith(`${assetPrefix}assets/`),
  );

  if (!hasBaseScopedEntryAsset) {
    throw new Error(
      `${preview.name} preview at ${url} returned HTML, but its entry assets do not use the expected base path "${assetPrefix}". Check the artifact workflow path and Vite BASE_PATH.`,
    );
  }
}

async function main(): Promise<void> {
  const origin = getPreviewOrigin();

  for (const preview of previews) {
    await checkPreview(origin, preview);
    console.log(`✓ ${preview.name}: ${getPreviewUrl(origin, preview.path)}`);
  }

  console.log("Preview smoke check passed.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Preview smoke check failed: ${message}`);
  process.exitCode = 1;
});
