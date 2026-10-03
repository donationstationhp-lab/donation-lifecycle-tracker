import { EventEmitter } from "node:events";

const CONNECTION_CODES = new Set([
  "ECONNREFUSED", "ECONNRESET", "EPIPE", "ETIMEDOUT", "ENETUNREACH",
  "EHOSTUNREACH", "ENOTFOUND", "EAI_AGAIN", "57P01", "57P02", "57P03", "53300",
]);

export class DatabaseUnavailableError extends Error {
  readonly code = "DATABASE_UNAVAILABLE";
  constructor() {
    super("Database temporarily unavailable. Please try again shortly.");
    this.name = "DatabaseUnavailableError";
  }
}

/** Drizzle wraps driver errors; do not confuse SQL/domain errors with outages. */
export function databaseConnectionErrorCode(error: unknown): string | undefined {
  const seen = new Set<unknown>();
  let current = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const { code, message, cause } = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (typeof code === "string" && (
      code === "DATABASE_UNAVAILABLE" || code.startsWith("08") || CONNECTION_CODES.has(code)
    )) return code;
    if (typeof message === "string" && /^(Connection terminated(?: unexpectedly)?|Connection ended unexpectedly|timeout exceeded when trying to connect|Connection terminated due to connection timeout|Query read timeout)$/i.test(message)) {
      return "CONNECTION_LOST";
    }
    current = cause;
  }
  return undefined;
}

export function isDatabaseConnectionError(error: unknown): boolean {
  return databaseConnectionErrorCode(error) !== undefined;
}

/** One probe at a time, regardless of how many requests/workers observe failure. */
export class DatabaseConnectionRecovery extends EventEmitter {
  private available = true;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private recovering = false;
  private stopped = false;
  private failureVersion = 0;
  private nextDelayMs: number;
  private retryDelayMs: number;
  private beforeReady: () => Promise<void> = async () => {};

  constructor(
    private readonly probe: (beforeReady: () => Promise<void>) => Promise<void>,
    private readonly baseDelayMs = 1_000,
    private readonly maxDelayMs = 30_000,
  ) {
    super();
    this.nextDelayMs = baseDelayMs;
    this.retryDelayMs = baseDelayMs;
  }

  get isAvailable(): boolean { return this.available; }
  get retryAfterSeconds(): number { return Math.max(1, Math.ceil(this.retryDelayMs / 1_000)); }

  setBeforeReady(callback: () => Promise<void>): void { this.beforeReady = callback; }

  assertAvailable(): void {
    if (!this.available) throw new DatabaseUnavailableError();
  }

  reportFailure(error: unknown, idlePoolError = false): void {
    const code = databaseConnectionErrorCode(error);
    if (!code && !idlePoolError) return;
    if (code !== "DATABASE_UNAVAILABLE") this.failureVersion += 1;
    if (this.available) {
      this.available = false;
      this.emit("unavailable", { code: code ?? "POOL_CONNECTION_ERROR" });
    }
    this.schedule();
  }

  private schedule(): void {
    if (this.stopped || this.timer || this.recovering) return;
    this.retryDelayMs = this.nextDelayMs;
    this.nextDelayMs = Math.min(this.maxDelayMs, this.nextDelayMs * 2);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.recover();
    }, this.retryDelayMs);
    this.timer.unref();
  }

  private async recover(): Promise<void> {
    this.recovering = true;
    const version = this.failureVersion;
    try {
      await this.probe(this.beforeReady);
      if (this.stopped) return;
      if (version !== this.failureVersion) return;
      this.available = true;
      this.nextDelayMs = this.baseDelayMs;
      this.retryDelayMs = this.baseDelayMs;
      this.emit("recovered");
    } catch (error) {
      // Log only classification, never driver objects (which contain credentials).
      this.emit("retry", {
        code: databaseConnectionErrorCode(error) ?? "DATABASE_RECOVERY_FAILED",
        retryInMs: this.nextDelayMs,
      });
    } finally {
      this.recovering = false;
      if (!this.available) this.schedule();
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
}