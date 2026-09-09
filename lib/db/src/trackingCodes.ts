import { sql } from "drizzle-orm";
import { db } from "./index";

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