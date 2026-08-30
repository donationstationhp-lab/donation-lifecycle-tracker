import { ReplitConnectors } from "@replit/connectors-sdk";
import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { db, notificationOutboxTable } from "@workspace/db";
import { randomUUID } from "node:crypto";
import { logger } from "./logger";

export interface AttendSheetsAdapter {
  append(row: readonly string[]): Promise<void>;
}

export const ATTEND_OUTBOX_MAX_ATTEMPTS = 5;
export const ATTEND_OUTBOX_RETRY_BASE_DELAY_MS = 30_000;
export const ATTEND_OUTBOX_RETRY_MAX_DELAY_MS = 30 * 60_000;
export const ATTEND_OUTBOX_RETRY_INTERVAL_MS = 30_000;
export const ATTEND_OUTBOX_BATCH_SIZE = 25;
export const ATTEND_OUTBOX_LEASE_DURATION_MS = 2 * 60_000;

export interface AttendOutboxRetryOptions {
  adapter?: AttendSheetsAdapter;
  now?: () => Date;
  maxAttempts?: number;
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
  leaseDurationMs?: number;
  batchSize?: number;
}

export interface AttendOutboxRetryWorker {
  stop(): void;
  runNow(): Promise<void>;
}

export function canClaimOutboxLease(status: string): boolean {
  return status === "pending" || status === "failed";
}

export function calculateAttendRetryDelayMs(
  attempts: number,
  baseDelayMs = ATTEND_OUTBOX_RETRY_BASE_DELAY_MS,
  maxDelayMs = ATTEND_OUTBOX_RETRY_MAX_DELAY_MS,
): number {
  const boundedAttempts = Math.max(1, Math.floor(attempts));
  const delay = baseDelayMs * (2 ** (boundedAttempts - 1));
  return Math.min(Math.max(0, delay), Math.max(0, maxDelayMs));
}

export class GoogleSheetsAttendAdapter implements AttendSheetsAdapter {
  private readonly spreadsheetId = process.env.ATTEND_SHEETS_SPREADSHEET_ID;
  private readonly range = process.env.ATTEND_SHEETS_RANGE ?? "'ATTEND Events'!A:G";
  private readonly connectors: ReplitConnectors;
  constructor(connectors = new ReplitConnectors()) { this.connectors = connectors; }

  async append(row: readonly string[]): Promise<void> {
    if (!this.spreadsheetId) throw new Error("ATTEND_SHEETS_SPREADSHEET_ID is not configured");
    const range = encodeURIComponent(this.range);
    let response;
    try {
      response = await this.connectors.proxy(
        "google-sheet",
        `/v4/spreadsheets/${encodeURIComponent(this.spreadsheetId)}/values/${range}:append?valueInputOption=USER_ENTERED`,
        { method: "POST", body: { values: [row] }, headers: { "content-type": "application/json" } },
      );
    } catch {
      throw new Error("Google Sheets request failed");
    }
    if (!response.ok) throw new Error(`Google Sheets append failed (${response.status})`);
  }
}

let attendAppendQueue: Promise<void> = Promise.resolve();

async function acquireAttendSheetAppendLock(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended('attend-google-sheets-append', 0))`,
  );
}

export async function withAttendSheetAppendLock<T>(
  operation: () => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await acquireAttendSheetAppendLock(tx);
    return operation();
  });
}

function queueAttendSheetOperation<T>(operation: () => Promise<T>): Promise<T> {
  const queued = attendAppendQueue.then(operation);
  attendAppendQueue = queued.then(() => undefined, () => undefined);
  return queued;
}

/**
 * Sheets append uses the current table boundary, so concurrent appends can
 * target the same next row. The PostgreSQL advisory lock coordinates every API
 * instance; the local queue avoids opening transactions that only wait on it.
 */
export function queueAttendSheetAppend(
  adapter: AttendSheetsAdapter,
  row: readonly string[],
): Promise<void> {
  return queueAttendSheetOperation(() =>
    withAttendSheetAppendLock(() => adapter.append(row)),
  );
}

type DeliverAttendOutboxOptions = Required<
  Pick<
    AttendOutboxRetryOptions,
    "now" | "maxAttempts" | "retryBaseDelayMs" | "retryMaxDelayMs" | "leaseDurationMs"
  >
> & { adapter: AttendSheetsAdapter };

function resolveDeliveryOptions(
  options: AttendOutboxRetryOptions,
): DeliverAttendOutboxOptions {
  return {
    adapter: options.adapter ?? new GoogleSheetsAttendAdapter(),
    now: options.now ?? (() => new Date()),
    maxAttempts: options.maxAttempts ?? ATTEND_OUTBOX_MAX_ATTEMPTS,
    retryBaseDelayMs: options.retryBaseDelayMs ?? ATTEND_OUTBOX_RETRY_BASE_DELAY_MS,
    retryMaxDelayMs: options.retryMaxDelayMs ?? ATTEND_OUTBOX_RETRY_MAX_DELAY_MS,
    leaseDurationMs: options.leaseDurationMs ?? ATTEND_OUTBOX_LEASE_DURATION_MS,
  };
}

function eligibleOutboxCondition(now: Date, maxAttempts: number) {
  return or(
    eq(notificationOutboxTable.status, "pending"),
    and(
      eq(notificationOutboxTable.status, "failed"),
      sql`${notificationOutboxTable.attempts} < ${maxAttempts}`,
      or(
        isNull(notificationOutboxTable.nextRetryAt),
        lte(notificationOutboxTable.nextRetryAt, now),
      ),
    ),
    and(
      eq(notificationOutboxTable.status, "processing"),
      sql`${notificationOutboxTable.attempts} < ${maxAttempts}`,
      or(
        isNull(notificationOutboxTable.processingLeaseUntil),
        lte(notificationOutboxTable.processingLeaseUntil, now),
      ),
    ),
  );
}

async function claimAttendOutbox(
  id: string,
  options: DeliverAttendOutboxOptions,
) {
  const now = options.now();
  const leaseUntil = new Date(now.getTime() + Math.max(1, options.leaseDurationMs));
  const leaseToken = randomUUID();
  return db.transaction(async (tx) => {
    await acquireAttendSheetAppendLock(tx);
    await tx
      .update(notificationOutboxTable)
      .set({
        status: "failed",
        lastError: sql`COALESCE(${notificationOutboxTable.lastError}, 'Delivery lease expired after final attempt')`,
        nextRetryAt: null,
        processingLeaseUntil: null,
        processingLeaseToken: null,
      })
      .where(
        and(
          eq(notificationOutboxTable.id, id),
          eq(notificationOutboxTable.status, "processing"),
          sql`${notificationOutboxTable.attempts} >= ${options.maxAttempts}`,
          or(
            isNull(notificationOutboxTable.processingLeaseUntil),
            lte(notificationOutboxTable.processingLeaseUntil, now),
          ),
        ),
      );
    const [message] = await tx
      .update(notificationOutboxTable)
      .set({
        status: "processing",
        processingLeaseUntil: leaseUntil,
        processingLeaseToken: leaseToken,
        attempts: sql`${notificationOutboxTable.attempts} + 1`,
      })
      .where(
        and(
          eq(notificationOutboxTable.id, id),
          eligibleOutboxCondition(now, options.maxAttempts),
        ),
      )
      .returning();
    return message ? { message, leaseToken } : undefined;
  });
}

async function exhaustExpiredAttendOutboxLeases(
  now: Date,
  maxAttempts: number,
): Promise<void> {
  await db.transaction(async (tx) => {
    await acquireAttendSheetAppendLock(tx);
    await tx
      .update(notificationOutboxTable)
      .set({
        status: "failed",
        lastError: sql`COALESCE(${notificationOutboxTable.lastError}, 'Delivery lease expired after final attempt')`,
        nextRetryAt: null,
        processingLeaseUntil: null,
        processingLeaseToken: null,
      })
      .where(
        and(
          eq(notificationOutboxTable.status, "processing"),
          sql`${notificationOutboxTable.attempts} >= ${maxAttempts}`,
          or(
            isNull(notificationOutboxTable.processingLeaseUntil),
            lte(notificationOutboxTable.processingLeaseUntil, now),
          ),
        ),
      );
  });
}

/** Best-effort post-commit delivery. It deliberately cannot affect the transition. */
export async function deliverAttendOutbox(
  id: string,
  adapter: AttendSheetsAdapter = new GoogleSheetsAttendAdapter(),
  retryOptions: Omit<AttendOutboxRetryOptions, "adapter"> = {},
): Promise<void> {
  const options = resolveDeliveryOptions({ ...retryOptions, adapter });
  // The lease is claimed atomically. A crashed worker can be recovered once the
  // lease expires, while simultaneous workers cannot claim the same live lease.
  const claim = await claimAttendOutbox(id, options);
  if (!claim) return;
  const { message, leaseToken } = claim;
  try {
    await queueAttendSheetOperation(() =>
      db.transaction(async (tx) => {
        await acquireAttendSheetAppendLock(tx);
        const [ownedLease] = await tx
          .select({ id: notificationOutboxTable.id })
          .from(notificationOutboxTable)
          .where(
            and(
              eq(notificationOutboxTable.id, id),
              eq(notificationOutboxTable.status, "processing"),
              eq(notificationOutboxTable.processingLeaseToken, leaseToken),
            ),
          );
        if (!ownedLease) return;
        await adapter.append([
          message.id,
          message.eventType,
          message.aggregateType,
          message.aggregateId,
          message.dedupeKey,
          message.payload,
          message.createdAt.toISOString(),
        ]);
        await tx
          .update(notificationOutboxTable)
          .set({
            status: "sent",
            sentAt: options.now(),
            nextRetryAt: null,
            processingLeaseUntil: null,
            processingLeaseToken: null,
            lastError: null,
          })
          .where(
            and(
              eq(notificationOutboxTable.id, id),
              eq(notificationOutboxTable.status, "processing"),
              eq(notificationOutboxTable.processingLeaseToken, leaseToken),
            ),
          );
      }),
    );
  } catch (error) {
    const description = error instanceof Error ? error.message : "Unknown Sheets delivery error";
    const nextRetryAt =
      message.attempts >= options.maxAttempts
        ? null
        : new Date(
            options.now().getTime() +
              calculateAttendRetryDelayMs(
                message.attempts,
                options.retryBaseDelayMs,
                options.retryMaxDelayMs,
              ),
          );
    await db
      .update(notificationOutboxTable)
      .set({
        status: "failed",
        nextRetryAt,
        processingLeaseUntil: null,
        processingLeaseToken: null,
        lastError: description,
      })
      .where(
        and(
          eq(notificationOutboxTable.id, id),
          eq(notificationOutboxTable.status, "processing"),
          eq(notificationOutboxTable.processingLeaseToken, leaseToken),
        ),
      );
    logger.warn({ outboxId: id, error: description }, "ATTEND Sheets delivery failed");
  }
}

export function deliverAttendOutboxBestEffort(
  id: string,
  retryOptions: AttendOutboxRetryOptions = {},
): void {
  void deliverAttendOutbox(id, retryOptions.adapter ?? new GoogleSheetsAttendAdapter(), retryOptions).catch((error) => {
    logger.warn({ outboxId: id, error: error instanceof Error ? error.message : "Unknown outbox error" }, "ATTEND outbox delivery failed");
  });
}

export async function deliverAttendOutboxByDedupeKey(dedupeKey: string): Promise<void> {
  const [message] = await db.select({ id: notificationOutboxTable.id }).from(notificationOutboxTable)
    .where(eq(notificationOutboxTable.dedupeKey, dedupeKey));
  if (message) deliverAttendOutboxBestEffort(message.id);
}

export async function retryAttendOutboxBatch(
  options: AttendOutboxRetryOptions = {},
): Promise<void> {
  const resolved = resolveDeliveryOptions(options);
  const batchSize = Math.max(1, Math.floor(options.batchSize ?? ATTEND_OUTBOX_BATCH_SIZE));
  const now = resolved.now();
  await exhaustExpiredAttendOutboxLeases(now, resolved.maxAttempts);
  const candidates = await db
    .select({ id: notificationOutboxTable.id })
    .from(notificationOutboxTable)
    .where(eligibleOutboxCondition(now, resolved.maxAttempts))
    .orderBy(asc(notificationOutboxTable.createdAt))
    .limit(batchSize);

  await Promise.all(
    candidates.map(({ id }) =>
      deliverAttendOutbox(id, resolved.adapter, {
        now: resolved.now,
        maxAttempts: resolved.maxAttempts,
        retryBaseDelayMs: resolved.retryBaseDelayMs,
        retryMaxDelayMs: resolved.retryMaxDelayMs,
        leaseDurationMs: resolved.leaseDurationMs,
      }),
    ),
  );
}

export function startAttendOutboxRetryWorker(
  options: AttendOutboxRetryOptions & { intervalMs?: number } = {},
): AttendOutboxRetryWorker {
  let running = false;
  let stopped = false;
  const runNow = async (): Promise<void> => {
    if (stopped || running) return;
    running = true;
    try {
      await retryAttendOutboxBatch(options);
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : "Unknown outbox worker error" },
        "ATTEND outbox retry worker failed",
      );
    } finally {
      running = false;
    }
  };
  const interval = Math.max(1, options.intervalMs ?? ATTEND_OUTBOX_RETRY_INTERVAL_MS);
  const timer = setInterval(() => void runNow(), interval);
  timer.unref();
  void runNow();
  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    },
    runNow,
  };
}