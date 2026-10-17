import { sql } from "drizzle-orm";
import type { db } from "./index";

/** Additive Development migration; avoids schema-tool truncation suggestions. */
export async function prepareDevelopmentDsSchema(executor: Pick<typeof db, "execute">) {
  await executor.execute(sql.raw(`
ALTER TABLE donation_items ADD COLUMN IF NOT EXISTS ds_number bigint;
ALTER TABLE item_identities ADD COLUMN IF NOT EXISTS ds_number bigint;
ALTER TABLE tracking_counters ALTER COLUMN next_number TYPE bigint USING next_number::bigint;
CREATE TABLE IF NOT EXISTS item_ds_reservations (
  ds_number bigint PRIMARY KEY,
  identity_id text,
  reserved_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT item_ds_reservation_positive CHECK (ds_number > 0)
);
DO $ddl$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='donation_items'::regclass
    AND conname='donation_items_ds_number_unique') THEN
    ALTER TABLE donation_items ADD CONSTRAINT donation_items_ds_number_unique UNIQUE(ds_number);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='item_identities'::regclass
    AND conname='item_identities_ds_number_unique') THEN
    ALTER TABLE item_identities ADD CONSTRAINT item_identities_ds_number_unique UNIQUE(ds_number);
  END IF;
END $ddl$;
`));
}

/** Explicit schema setup, never called at application startup. */
export async function installDsNumberConstraints(executor: Pick<typeof db, "execute">) {
  await executor.execute(sql.raw(`
CREATE OR REPLACE FUNCTION protect_item_ds_number() RETURNS trigger
LANGUAGE plpgsql AS $body$
DECLARE label text; owner text; n bigint; reserved_owner text; canonical boolean;
BEGIN
  canonical := TG_TABLE_NAME IN ('donation_items', 'item_identities');
  IF TG_TABLE_NAME = 'donation_items' THEN label := NEW.item_id; owner := NEW.id;
  ELSIF TG_TABLE_NAME = 'item_identities' THEN label := NEW.display_id; owner := NEW.id;
  ELSIF TG_TABLE_NAME = 'item_identity_aliases' THEN label := NEW.alias; owner := NEW.identity_id;
  ELSE label := NEW.source_item_id; owner := NEW.identity_id;
  END IF;
  IF label IS NULL OR label !~ '^DS-[0-9]+$' THEN
    IF canonical THEN NEW.ds_number := NULL; END IF;
    RETURN NEW;
  END IF;
  n := substring(label FROM 4)::bigint;
  IF n < 1 THEN RAISE EXCEPTION 'DS numbers must be positive' USING ERRCODE='23514'; END IF;
  INSERT INTO item_ds_reservations(ds_number,identity_id)
    VALUES(n, CASE WHEN canonical THEN owner ELSE NULL END)
    ON CONFLICT(ds_number) DO NOTHING;
  IF canonical THEN
    SELECT identity_id INTO reserved_owner FROM item_ds_reservations WHERE ds_number=n FOR UPDATE;
    IF reserved_owner IS DISTINCT FROM owner THEN
      RAISE EXCEPTION 'DS number is already reserved by another identity or historical alias'
        USING ERRCODE='23505', CONSTRAINT='item_ds_number_reserved';
    END IF;
    NEW.ds_number := n;
  END IF;
  RETURN NEW;
END $body$;
DROP TRIGGER IF EXISTS donation_item_ds_number ON donation_items;
CREATE TRIGGER donation_item_ds_number BEFORE INSERT OR UPDATE ON donation_items
FOR EACH ROW EXECUTE FUNCTION protect_item_ds_number();
DROP TRIGGER IF EXISTS identity_ds_number ON item_identities;
CREATE TRIGGER identity_ds_number BEFORE INSERT OR UPDATE ON item_identities
FOR EACH ROW EXECUTE FUNCTION protect_item_ds_number();
DROP TRIGGER IF EXISTS alias_ds_number ON item_identity_aliases;
CREATE TRIGGER alias_ds_number BEFORE INSERT OR UPDATE ON item_identity_aliases
FOR EACH ROW EXECUTE FUNCTION protect_item_ds_number();
DROP TRIGGER IF EXISTS snapshot_ds_number ON notion_item_snapshots;
CREATE TRIGGER snapshot_ds_number BEFORE INSERT OR UPDATE ON notion_item_snapshots
FOR EACH ROW EXECUTE FUNCTION protect_item_ds_number();
`));
}
