import { asc, eq, sql } from "drizzle-orm";
import { db } from "./index";
import { claimsTable } from "./schema/attendLifecycle";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const CLAIM_COUNTER_NAME = "claim";
const MAX_CLAIM_TRACKING_NUMBER = 999_999;

export function formatClaimTrackingCode(number: number): string {
  if (!Number.isInteger(number) || number < 1 || number > MAX_CLAIM_TRACKING_NUMBER) {
    throw new Error("Claim tracking code range exhausted");
  }

  return `DSC-${number.toString().padStart(6, "0")}`;
}

export async function allocateClaimTrackingCode(
  tx: DbTransaction,
): Promise<string> {
  await tx.execute(sql`
    INSERT INTO tracking_counters (name, next_number)
    SELECT
      ${CLAIM_COUNTER_NAME},
      COALESCE(
        MAX(
          CASE
            WHEN tracking_code ~ '^DSC-[0-9]{6}$'
            THEN substring(tracking_code FROM 5)::integer
          END
        ) + 1,
        1
      )
    FROM claims
    ON CONFLICT (name) DO NOTHING
  `);

  const result = await tx.execute<{ allocated_number: number }>(sql`
    UPDATE tracking_counters
    SET next_number = next_number + 1
    WHERE name = ${CLAIM_COUNTER_NAME}
    RETURNING next_number - 1 AS allocated_number
  `);
  const allocatedNumber = Number(result.rows[0]?.allocated_number);

  return formatClaimTrackingCode(allocatedNumber);
}

export async function backfillClaimTrackingCodes(
  tx: DbTransaction,
): Promise<Array<{ id: string; trackingCode: string }>> {
  const claims = await tx
    .select({ id: claimsTable.id })
    .from(claimsTable)
    .where(sql`${claimsTable.trackingCode} IS NULL`)
    .orderBy(asc(claimsTable.createdAt), asc(claimsTable.id))
    .for("update");

  const assigned: Array<{ id: string; trackingCode: string }> = [];
  for (const claim of claims) {
    const trackingCode = await allocateClaimTrackingCode(tx);
    await tx
      .update(claimsTable)
      .set({ trackingCode })
      .where(eq(claimsTable.id, claim.id));
    assigned.push({ id: claim.id, trackingCode });
  }

  return assigned;
}

export async function ensureClaimTrackingCodes(): Promise<
  Array<{ id: string; trackingCode: string }>
> {
  return db.transaction(backfillClaimTrackingCodes);
}

async function installClaimTrackingCodeImmutability(
  tx: DbTransaction,
): Promise<void> {
  await tx.execute(sql`
    CREATE OR REPLACE FUNCTION preserve_claim_tracking_code()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    BEGIN
      IF OLD.tracking_code IS NOT NULL
        AND NEW.tracking_code IS DISTINCT FROM OLD.tracking_code
      THEN
        RAISE EXCEPTION 'Claim tracking codes are immutable once assigned'
          USING ERRCODE = '23514',
                CONSTRAINT = 'claims_tracking_code_immutable';
      END IF;

      RETURN NEW;
    END;
    $function$
  `);

  await tx.execute(sql`
    DROP TRIGGER IF EXISTS claims_tracking_code_immutable_trigger ON claims
  `);
  await tx.execute(sql`
    CREATE TRIGGER claims_tracking_code_immutable_trigger
    BEFORE UPDATE OF tracking_code ON claims
    FOR EACH ROW
    EXECUTE FUNCTION preserve_claim_tracking_code()
  `);
}

export async function initializeClaimTrackingCodes(): Promise<
  Array<{ id: string; trackingCode: string }>
> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
    await tx.execute(sql`SET LOCAL statement_timeout = '30s'`);
    await tx.execute(sql`LOCK TABLE claims IN SHARE ROW EXCLUSIVE MODE`);
    const assigned = await backfillClaimTrackingCodes(tx);
    await installClaimTrackingCodeImmutability(tx);
    return assigned;
  });
}