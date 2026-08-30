import { ReplitConnectors } from "@replit/connectors-sdk";
import { and, eq, or, sql } from "drizzle-orm";
import { db, notificationOutboxTable } from "@workspace/db";
import { logger } from "./logger";

export interface AttendSheetsAdapter {
  append(row: readonly string[]): Promise<void>;
}
export function canClaimOutboxLease(status: string): boolean {
  return status === "pending" || status === "failed";
}

export class GoogleSheetsAttendAdapter implements AttendSheetsAdapter {
  private readonly spreadsheetId = process.env.ATTEND_SHEETS_SPREADSHEET_ID;
  private readonly range = process.env.ATTEND_SHEETS_RANGE ?? "'ATTEND Events'!A:G";
  private readonly connectors: ReplitConnectors;
  constructor(connectors = new ReplitConnectors()) { this.connectors = connectors; }

  async append(row: readonly string[]): Promise<void> {
    if (!this.spreadsheetId) throw new Error("ATTEND_SHEETS_SPREADSHEET_ID is not configured");
    const range = encodeURIComponent(this.range);
    const response = await this.connectors.proxy(
      "google-sheet",
      `/v4/spreadsheets/${encodeURIComponent(this.spreadsheetId)}/values/${range}:append?valueInputOption=USER_ENTERED`,
      { method: "POST", body: { values: [row] }, headers: { "content-type": "application/json" } },
    );
    if (!response.ok) throw new Error(`Google Sheets append failed (${response.status})`);
  }
}

let attendAppendQueue: Promise<void> = Promise.resolve();

export async function withAttendSheetAppendLock<T>(
  operation: () => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended('attend-google-sheets-append', 0))`,
    );
    return operation();
  });
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
  const operation = attendAppendQueue.then(() =>
    withAttendSheetAppendLock(() => adapter.append(row)),
  );
  attendAppendQueue = operation.catch(() => undefined);
  return operation;
}

/** Best-effort post-commit delivery.  It deliberately cannot affect the transition. */
export async function deliverAttendOutbox(
  id: string,
  adapter: AttendSheetsAdapter = new GoogleSheetsAttendAdapter(),
): Promise<void> {
  // Claim a short-lived logical lease atomically. A process crash after append but
  // before sent can still be retried (Sheets has no external idempotency key), but
  // simultaneous workers cannot append the same event.
  const [message] = await db.update(notificationOutboxTable)
    .set({ status: "processing", lastError: null })
    .where(and(eq(notificationOutboxTable.id, id), or(eq(notificationOutboxTable.status, "pending"), eq(notificationOutboxTable.status, "failed"))))
    .returning();
  if (!message) return;
  try {
    await queueAttendSheetAppend(adapter, [
      message.id,
      message.eventType,
      message.aggregateType,
      message.aggregateId,
      message.dedupeKey,
      message.payload,
      message.createdAt.toISOString(),
    ]);
    await db.update(notificationOutboxTable).set({ status: "sent", sentAt: new Date(), attempts: message.attempts + 1, lastError: null }).where(and(eq(notificationOutboxTable.id, id), eq(notificationOutboxTable.status, "processing")));
  } catch (error) {
    const description = error instanceof Error ? error.message : "Unknown Sheets delivery error";
    await db.update(notificationOutboxTable).set({ status: "failed", attempts: message.attempts + 1, lastError: description }).where(and(eq(notificationOutboxTable.id, id), eq(notificationOutboxTable.status, "processing")));
    logger.warn({ outboxId: id, error: description }, "ATTEND Sheets delivery failed");
  }
}

export function deliverAttendOutboxBestEffort(id: string): void {
  void deliverAttendOutbox(id).catch((error) => {
    logger.warn({ outboxId: id, error: error instanceof Error ? error.message : "Unknown outbox error" }, "ATTEND outbox delivery failed");
  });
}

export async function deliverAttendOutboxByDedupeKey(dedupeKey: string): Promise<void> {
  const [message] = await db.select({ id: notificationOutboxTable.id }).from(notificationOutboxTable)
    .where(eq(notificationOutboxTable.dedupeKey, dedupeKey));
  if (message) deliverAttendOutboxBestEffort(message.id);
}