export const STARTUP_SECRET_NAMES = [
  "NOTION_API_KEY",
  "DONATION_STATION_API_KEY",
] as const;

export type StartupSecretName = (typeof STARTUP_SECRET_NAMES)[number];
export type StartupSecretSource = "vault" | "fallback";

const VAULT_BASE_URL = "https://secret-key-api.replit.app/api/service/secrets";
const VAULT_REQUEST_TIMEOUT_MS = 2_000;
const VAULT_ATTEMPTS = 2;
const RETRY_DELAY_MIN_MS = 100;
const RETRY_DELAY_JITTER_MS = 200;

const secretCache = new Map<StartupSecretName, string>();
const sourceCache = new Map<StartupSecretName, StartupSecretSource>();
const inFlight = new Map<
  StartupSecretName,
  Promise<{ value: string; source: StartupSecretSource }>
>();
let initialization: Promise<
  Readonly<Record<StartupSecretName, StartupSecretSource>>
> | null = null;

function extractSecretValue(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload.trim() || undefined;
  }
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const candidate = payload as {
    value?: unknown;
    secret?: unknown;
    data?: unknown;
  };
  return (
    extractSecretValue(candidate.value)
    ?? extractSecretValue(candidate.secret)
    ?? extractSecretValue(candidate.data)
  );
}

function delayWithJitter(): Promise<void> {
  const delay =
    RETRY_DELAY_MIN_MS + Math.floor(Math.random() * RETRY_DELAY_JITTER_MS);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

async function fetchFromVault(
  name: StartupSecretName,
): Promise<string | undefined> {
  const token = process.env.VAULT_SERVICE_TOKEN?.trim();
  if (!token) return undefined;

  for (let attempt = 1; attempt <= VAULT_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      VAULT_REQUEST_TIMEOUT_MS,
    );

    try {
      const response = await fetch(
        `${VAULT_BASE_URL}/${encodeURIComponent(name)}`,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        },
      );

      if (response.ok) {
        const contentType = response.headers.get("content-type") ?? "";
        const payload: unknown = contentType.includes("application/json")
          ? await response.json()
          : await response.text();
        const value = extractSecretValue(payload);
        if (value) return value;
      }
    } catch {
      // The local environment fallback is evaluated after bounded retries.
    } finally {
      clearTimeout(timeout);
    }

    if (attempt < VAULT_ATTEMPTS) {
      await delayWithJitter();
    }
  }

  return undefined;
}

async function resolveSecret(
  name: StartupSecretName,
): Promise<{ value: string; source: StartupSecretSource }> {
  const cachedValue = secretCache.get(name);
  const cachedSource = sourceCache.get(name);
  if (cachedValue && cachedSource) {
    return { value: cachedValue, source: cachedSource };
  }

  const pending = inFlight.get(name);
  if (pending) return pending;

  const resolution = (async () => {
    const vaultValue = await fetchFromVault(name);
    const fallbackValue = process.env[name]?.trim();
    const value = vaultValue ?? fallbackValue;
    const source: StartupSecretSource = vaultValue ? "vault" : "fallback";

    if (!value) {
      throw new Error(
        `Required startup secret ${name} is unavailable from both vault and local fallback`,
      );
    }

    secretCache.set(name, value);
    sourceCache.set(name, source);
    return { value, source };
  })();

  inFlight.set(name, resolution);
  try {
    return await resolution;
  } finally {
    inFlight.delete(name);
  }
}

export function initializeStartupSecrets(): Promise<
  Readonly<Record<StartupSecretName, StartupSecretSource>>
> {
  if (initialization) return initialization;

  initialization = (async () => {
    const resolved = await Promise.all(
      STARTUP_SECRET_NAMES.map(async (name) => ({
        name,
        ...(await resolveSecret(name)),
      })),
    );

    return Object.freeze(
      Object.fromEntries(
        resolved.map(({ name, source }) => [name, source]),
      ) as Record<StartupSecretName, StartupSecretSource>,
    );
  })();

  return initialization;
}

export function getStartupSecret(name: StartupSecretName): string {
  const value = secretCache.get(name);
  if (!value) {
    throw new Error(`Startup secret ${name} was accessed before initialization`);
  }
  return value;
}